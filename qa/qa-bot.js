const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const assert = require('assert');
const { io } = require('socket.io-client');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout: ${label || 'operation'} (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function waitForPort(port, host, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const ok = await new Promise((resolve) => {
      const s = new net.Socket();
      s.once('error', () => resolve(false));
      s.once('connect', () => { s.end(); resolve(true); });
      s.connect(port, host);
    });
    if (ok) return true;
    await sleep(100);
  }
  return false;
}

function waitForEvent(socket, event, ms) {
  return withTimeout(new Promise((resolve) => {
    socket.once(event, (payload) => resolve(payload));
  }), ms, `socket event "${event}"`);
}

function waitForEventWhere(socket, event, predicate, ms) {
  return withTimeout(new Promise((resolve) => {
    const handler = (payload) => {
      try {
        if (predicate(payload)) {
          socket.off(event, handler);
          resolve(payload);
        }
      } catch { }
    };
    socket.on(event, handler);
  }), ms, `socket event "${event}" (predicate)`);
}

function emitAck(socket, event, payload, ms) {
  return withTimeout(new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => {
      if (!response) return reject(new Error(`No ack for ${event}`));
      resolve(response);
    });
  }), ms, `ack "${event}"`);
}

async function run() {
  const port = Number(process.env.QA_PORT || 3107);
  const host = '127.0.0.1';
  const serverEntry = path.join(__dirname, '..', 'server', 'index.js');

  const server = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, PORT: String(port) },
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = { out: [], err: [] };
  server.stdout.on('data', (d) => logs.out.push(String(d)));
  server.stderr.on('data', (d) => logs.err.push(String(d)));

  const up = await waitForPort(port, host, 8000);
  if (!up) {
    try { server.kill('SIGTERM'); } catch { }
    throw new Error(`Server did not start on ${host}:${port}\n${logs.out.join('')}\n${logs.err.join('')}`);
  }

  const url = `http://${host}:${port}`;
  const c1 = io(url, { transports: ['websocket'], timeout: 5000, reconnection: false });
  const c2 = io(url, { transports: ['websocket'], timeout: 5000, reconnection: false });

  try {
    await withTimeout(Promise.all([
      new Promise((r) => c1.on('connect', r)),
      new Promise((r) => c2.on('connect', r)),
    ]), 8000, 'connect two clients');

    const usersWait1 = waitForEventWhere(c1, 'room-users', (u) => Array.isArray(u) && u.length === 2, 12000);
    const usersWait2 = waitForEventWhere(c2, 'room-users', (u) => Array.isArray(u) && u.length === 2, 12000);

    const create = await emitAck(c1, 'create-room', 'QA1', 8000);
    assert.strictEqual(create.success, true);
    assert.ok(create.roomId);

    const join = await emitAck(c2, 'join-room', { roomId: create.roomId, username: 'QA2' }, 8000);
    assert.strictEqual(join.success, true);
    assert.strictEqual(join.roomId, create.roomId);

    const users1 = await usersWait1;
    const users2 = await usersWait2;

    assert.ok(Array.isArray(users1) && users1.length === 2);
    assert.ok(Array.isArray(users2) && users2.length === 2);

    c1.emit('start-game', { game: 'xox' });
    await withTimeout(Promise.all([
      waitForEvent(c1, 'game-launch', 8000),
      waitForEvent(c2, 'game-launch', 8000),
      waitForEvent(c1, 'game-started-xox', 8000),
      waitForEvent(c2, 'game-started-xox', 8000),
    ]), 8000, 'xox start flow');

    c1.emit('browser-open', { url: 'https://www.google.com/search?igu=1&q=remoce' });
    await withTimeout(Promise.all([
      waitForEvent(c1, 'browser-open', 8000),
      waitForEvent(c2, 'browser-open', 8000),
    ]), 8000, 'browser open sync');

    c2.emit('browser-navigate', { url: 'https://www.wikipedia.org/' });
    await withTimeout(Promise.all([
      waitForEvent(c1, 'browser-navigate', 8000),
      waitForEvent(c2, 'browser-navigate', 8000),
    ]), 8000, 'browser navigate sync');

    c1.emit('start-game', { game: 'riddle' });
    await withTimeout(Promise.all([
      waitForEvent(c1, 'game-started-riddle', 8000),
      waitForEvent(c2, 'game-started-riddle', 8000),
    ]), 8000, 'riddle start flow');

    c1.emit('start-game', { game: 'math' });
    await withTimeout(Promise.all([
      waitForEvent(c1, 'game-started-math', 8000),
      waitForEvent(c2, 'game-started-math', 8000),
    ]), 8000, 'math start flow');

    c1.emit('start-game', { game: 'reaction' });
    await withTimeout(Promise.all([
      waitForEvent(c1, 'game-started-reaction', 8000),
      waitForEvent(c2, 'game-started-reaction', 8000),
      waitForEvent(c1, 'game-reaction-go', 12000),
    ]), 12000, 'reaction start flow');

    process.stdout.write(`QA OK: ${url}\n`);
  } catch (e) {
    process.stderr.write(`QA FAIL: ${e.message}\n`);
    process.stderr.write(`--- server stdout ---\n${logs.out.join('')}\n`);
    process.stderr.write(`--- server stderr ---\n${logs.err.join('')}\n`);
    throw e;
  } finally {
    try { c1.close(); } catch { }
    try { c2.close(); } catch { }
    try { server.kill('SIGTERM'); } catch { }
    await sleep(200);
    try { server.kill('SIGKILL'); } catch { }
  }
}

run().catch(() => process.exit(1));

