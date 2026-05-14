import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export default function RemoteBrowser({ socket, myId, visible, onReady }) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const imgRef = useRef(null);
  const lastFrameRef = useRef({ img: null, w: 1280, h: 720 });
  const keysRef = useRef(null);
  const pointersRef = useRef(new Map());
  const lastTouchMidRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Bağlanıyor...');

  const [vp, setVp] = useState({ w: 1280, h: 720 });
  const [dpr, setDpr] = useState(1);

  const canSend = useMemo(() => !!socket && connected && visible, [socket, connected, visible]);

  useEffect(() => {
    if (!socket) return;

    const onSess = ({ ok, message, viewport, dpr: rdpr }) => {
      if (!ok) {
        setStatus(message || 'Tarayıcı oturumu başlatılamadı');
        setConnected(false);
        if (onReady) onReady(false);
        return;
      }
      setConnected(true);
      setStatus('');
      if (viewport?.w && viewport?.h) setVp({ w: viewport.w, h: viewport.h });
      if (typeof rdpr === 'number') setDpr(rdpr);
      if (onReady) onReady(true);
    };

    socket.on('rb-session', onSess);
    return () => socket.off('rb-session', onSess);
  }, [socket, onReady]);

  useEffect(() => {
    if (!socket || !visible) return;
    socket.emit('rb-open');
  }, [socket, visible]);

  useEffect(() => {
    if (!socket) return;

    const onFrame = ({ data, viewport, dpr: rdpr }) => {
      if (!visible) return;
      if (viewport?.w && viewport?.h) setVp({ w: viewport.w, h: viewport.h });
      if (typeof rdpr === 'number') setDpr(rdpr);

      const img = new Image();
      img.onload = () => {
        const w = viewport?.w || vp.w;
        const h = viewport?.h || vp.h;
        lastFrameRef.current = { img, w, h };
      };
      img.src = `data:image/jpeg;base64,${data}`;
    };

    socket.on('rb-frame', onFrame);
    return () => socket.off('rb-frame', onFrame);
  }, [socket, visible, vp.w, vp.h]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext?.('2d');
      const frame = lastFrameRef.current;
      if (canvas && ctx && frame.img) {
        const rect = canvas.getBoundingClientRect();
        const cw = Math.max(1, Math.floor(rect.width));
        const ch = Math.max(1, Math.floor(rect.height));
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw;
          canvas.height = ch;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(frame.img, 0, 0, cw, ch);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toRemotePoint = useCallback((clientX, clientY) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const x = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * vp.w;
    const y = clamp((clientY - r.top) / Math.max(1, r.height), 0, 1) * vp.h;
    return { x: Math.round(x), y: Math.round(y) };
  }, [vp.w, vp.h]);

  const sendMouse = useCallback((payload) => {
    if (!canSend) return;
    socket.emit('rb-input', payload);
  }, [socket, canSend]);

  const sendKey = useCallback((payload) => {
    if (!canSend) return;
    socket.emit('rb-key', payload);
  }, [socket, canSend]);

  const focusKeys = useCallback(() => {
    wrapperRef.current?.focus?.();
    keysRef.current?.focus?.();
  }, []);

  const onPointerDown = useCallback((e) => {
    focusKeys();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, pointerType: e.pointerType });
    const { x, y } = toRemotePoint(e.clientX, e.clientY);
    const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
    sendMouse({ kind: 'move', x, y });
    sendMouse({ kind: 'down', x, y, button });
  }, [focusKeys, toRemotePoint, sendMouse]);

  const onPointerMove = useCallback((e) => {
    const prev = pointersRef.current.get(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, pointerType: e.pointerType });

    const touches = Array.from(pointersRef.current.values()).filter(p => p.pointerType === 'touch');
    if (touches.length >= 2) {
      const t1 = touches[0];
      const t2 = touches[1];
      const mid = { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 };
      const lastMid = lastTouchMidRef.current;
      lastTouchMidRef.current = mid;
      if (lastMid) {
        const dx = lastMid.x - mid.x;
        const dy = lastMid.y - mid.y;
        const { x, y } = toRemotePoint(mid.x, mid.y);
        sendMouse({ kind: 'wheel', x, y, dx, dy });
      }
      e.preventDefault();
      return;
    }

    lastTouchMidRef.current = null;
    const { x, y } = toRemotePoint(e.clientX, e.clientY);
    sendMouse({ kind: 'move', x, y });
  }, [toRemotePoint, sendMouse]);

  const onPointerUp = useCallback((e) => {
    const { x, y } = toRemotePoint(e.clientX, e.clientY);
    const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
    sendMouse({ kind: 'up', x, y, button });
    pointersRef.current.delete(e.pointerId);
    const touches = Array.from(pointersRef.current.values()).filter(p => p.pointerType === 'touch');
    if (touches.length < 2) lastTouchMidRef.current = null;
  }, [toRemotePoint, sendMouse]);

  const onPointerCancel = useCallback((e) => {
    pointersRef.current.delete(e.pointerId);
    const touches = Array.from(pointersRef.current.values()).filter(p => p.pointerType === 'touch');
    if (touches.length < 2) lastTouchMidRef.current = null;
  }, []);

  const onWheel = useCallback((e) => {
    const { x, y } = toRemotePoint(e.clientX, e.clientY);
    sendMouse({ kind: 'wheel', x, y, dx: e.deltaX, dy: e.deltaY });
  }, [toRemotePoint, sendMouse]);

  const onKeyDown = useCallback((e) => {
    if (!canSend) return;
    if (e.key === 'Tab') e.preventDefault();
    sendKey({ kind: 'down', key: e.key, code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      sendKey({ kind: 'type', text: e.key });
    }
  }, [sendKey, canSend]);

  const onKeyUp = useCallback((e) => {
    if (!canSend) return;
    sendKey({ kind: 'up', key: e.key, code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
  }, [sendKey, canSend]);

  const onKeysInput = useCallback((e) => {
    if (!canSend) return;
    const v = e.target.value;
    if (v) {
      sendKey({ kind: 'type', text: v });
      e.target.value = '';
    }
  }, [canSend, sendKey]);

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      style={{ width: '100%', height: '100%', outline: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, display: status ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8', zIndex: 2 }}>
        {status}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', background: '#fff', touchAction: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onWheel={onWheel}
      />
      <textarea
        ref={keysRef}
        onInput={onKeysInput}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        inputMode="text"
        style={{ position: 'absolute', opacity: 0, left: -9999, top: 0, width: 1, height: 1 }}
      />
      <img ref={imgRef} alt="" style={{ display: 'none' }} />
      <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 10, padding: '4px 6px', borderRadius: 8, zIndex: 3 }}>
        {vp.w}×{vp.h} @ {dpr}x
      </div>
    </div>
  );
}
