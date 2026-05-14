const express = require('express');
const http = require('http');
const https = require('https');
const httpModule = require('http');
const cors = require('cors');
const { chromium } = require('playwright');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean) : null;
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (!allowedOrigins) return cb(null, true);
    return cb(null, allowedOrigins.includes(origin));
  },
  methods: ['GET', 'POST'],
}));

app.get('/health', (req, res) => res.json({ ok: true }));

const remoteBrowsers = new Map();

async function ensureRemoteBrowser(roomId, io) {
  const existing = remoteBrowsers.get(roomId);
  if (existing?.page && existing?.cdp && existing?.browser) return existing;

  const viewport = { w: 1280, h: 720 };
  const dpr = 1;
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    deviceScaleFactor: dpr,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: viewport.w, maxHeight: viewport.h, everyNthFrame: 1 });

  const state = { browser, context, page, cdp, viewport, dpr };
  remoteBrowsers.set(roomId, state);

  cdp.on('Page.screencastFrame', async (evt) => {
    try {
      io.to(roomId).emit('rb-frame', { data: evt.data, viewport, dpr });
      await cdp.send('Page.screencastFrameAck', { sessionId: evt.sessionId });
    } catch { }
  });

  return state;
}

async function closeRemoteBrowser(roomId) {
  const s = remoteBrowsers.get(roomId);
  remoteBrowsers.delete(roomId);
  if (!s) return;
  try { await s.cdp?.detach?.(); } catch { }
  try { await s.context?.close?.(); } catch { }
  try { await s.browser?.close?.(); } catch { }
}

// ===== PROXY ENDPOINT =====
// iframe içinde açılamayan siteleri bypass eder
app.get('/proxy', (req, res) => {
  let target = String(req.query.url || '').trim();
  if (!target) return res.status(400).send('URL gerekli');
  // Başına https:// ekle (örn: duckduckgo.com/c/...)
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
  const injected = `<script>(function(){try{if(window.__remoceInjected)return;window.__remoceInjected=true;var send=function(action){try{if(window.__remoceMute)return;parent.postMessage({source:'remoce',type:'action',action:action},'*')}catch(e){}};var pathOf=function(el){try{var path=[];while(el&&el!==document.documentElement){var p=el.parentNode;if(!p)break;var idx=Array.prototype.indexOf.call(p.childNodes,el);path.push(idx);el=p}path.push(0);return path.reverse()}catch(e){return[]}};var getOriginalUrl=function(){try{var p=new URLSearchParams(location.search);var u=p.get('url');if(!u)return'';try{return decodeURIComponent(u)}catch(e){return u}}catch(e){return''}};document.addEventListener('click',function(e){var t=e.target;if(!(t instanceof Element))return;var a=t.closest&&t.closest('a[href]');if(a){var raw=a.getAttribute('href')||'';if(raw&&raw!==''&&!raw.startsWith('#')&&!raw.startsWith('javascript:')){e.preventDefault();var base=getOriginalUrl()||'';var target='';try{if(raw.startsWith('http://')||raw.startsWith('https://'))target=raw;else if(raw.startsWith('//'))target=(base.startsWith('https:')?'https:':'http:')+raw;else target=new URL(raw,base||'https://example.com').toString()}catch(err){target=''}if(target)send({kind:'navigate',url:target});return}}send({kind:'click',path:pathOf(t),cx:e.clientX,cy:e.clientY,sx:window.scrollX,sy:window.scrollY})},true);document.addEventListener('input',function(e){var t=e.target;if(!(t instanceof Element))return;var value=null;if(t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement)value=t.value;else if(t.isContentEditable)value=t.innerText;else return;send({kind:'input',path:pathOf(t),value:value})},true);var st=null;window.addEventListener('scroll',function(){clearTimeout(st);st=setTimeout(function(){send({kind:'scroll',x:window.scrollX,y:window.scrollY})},80)},{passive:true});send({kind:'ready',url:getOriginalUrl()||location.href})}catch(e){}})();</script>`;
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'Accept-Encoding': 'identity',
    }
  };
  const fetchUrl = (url, redirectsLeft = 5) => {
    const mod = url.startsWith('https') ? https : httpModule;
    mod.get(url, options, (proxyRes) => {
      const status = proxyRes.statusCode || 200;
      const location = proxyRes.headers?.location;
      if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0) {
        const nextUrl = new URL(location, url).toString();
        proxyRes.resume();
        return fetchUrl(nextUrl, redirectsLeft - 1);
      }
      const headers = { ...proxyRes.headers };
      delete headers['x-frame-options'];
      delete headers['content-security-policy'];
      delete headers['x-content-type-options'];
      delete headers['strict-transport-security'];
      const contentType = String(headers['content-type'] || '');
      if (contentType.includes('text/html')) {
        const chunks = [];
        let total = 0;
        const limit = 2 * 1024 * 1024;
        proxyRes.on('data', (c) => {
          if (total > limit) return;
          chunks.push(c);
          total += c.length;
        });
        proxyRes.on('end', () => {
          if (total > limit) {
            delete headers['content-length'];
            res.writeHead(status, headers);
            return res.end(Buffer.concat(chunks));
          }
          let html = Buffer.concat(chunks).toString('utf8');
          html = html.includes('</body>') ? html.replace('</body>', injected + '</body>') : (html + injected);
          delete headers['content-length'];
          res.writeHead(status, headers);
          res.end(html);
        });
        return;
      }
      res.writeHead(status, headers);
      proxyRes.pipe(res);
    }).on('error', (err) => {
      res.status(502).send(`<html><body style="font-family:sans-serif;padding:2rem;background:#111;color:#fff"><h2>🔒 Bağlantı Hatası</h2><p>${err.message}</p><p>Yeni sekmede aç: <a href="${target}" target="_blank" style="color:#60a5fa">${target}</a></p></body></html>`);
    }).setTimeout(10000, () => {
      res.status(504).send('<html><body style="font-family:sans-serif;padding:2rem;background:#111;color:#fff"><h2>⏱️ Zaman Aşımı</h2><p>Site yanıt vermedi.</p></body></html>');
    });
  };
  fetchUrl(target, 5);
});

// ===== ÇOKLU ARAMA API =====
const SERP_API_KEY = process.env.SERP_API_KEY || '';
const MOJEEK_API_KEY = process.env.MOJEEK_API_KEY || false;

app.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ results: [] });
  serpSearch(q, res, 0);
});

function serpSearch(q, res, attempt = 0) {
  if (!SERP_API_KEY) return nextEngine(q, res);
  const apiUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&hl=tr&gl=tr&api_key=${SERP_API_KEY}&num=10`;
  const timeout = setTimeout(() => { console.log('⏱ SerpAPI timeout'); nextEngine(q, res); }, 8000);
  https.get(apiUrl, { headers: { 'User-Agent': 'Remoce/1.0' } }, (r) => {
    let data = '';
    r.on('data', d => data += d);
    r.on('end', () => {
      clearTimeout(timeout);
      try {
        const json = JSON.parse(data);
        if (json.error || !json.organic_results) {
          console.warn('SerpAPI hata:', json.error?.message || 'sonuç yok');
          return nextEngine(q, res);
        }
        const results = (json.organic_results || []).map(item => ({
          title: item.title || '', url: item.link || '', desc: item.snippet || '', thumb: item.thumbnail || '',
        }));
        console.log(`🔍 SerpAPI: "${q}" → ${results.length} sonuç`);
        res.json({ results, query: q, engine: 'google' });
      } catch (e) { console.error('SerpAPI parse:', e.message); nextEngine(q, res); }
    });
  }).on('error', () => { clearTimeout(timeout); nextEngine(q, res); });
}

function nextEngine(q, res) {
  if (MOJEEK_API_KEY) {
    console.log('🔄 Mojeek deneniyor...');
    return mojeekSearch(q, res);
  }
  console.log('🔄 ScrapingBee deneniyor...');
  scrapingbeeSearch(q, res);
}

const SCRAPINGBEE_KEY = process.env.SCRAPINGBEE_KEY || '';

// ScrapingBee ile Google scraping
function scrapingbeeSearch(q, res) {
  if (!SCRAPINGBEE_KEY) return browserSearch(q, res, 0);
  const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=tr&gl=TR&num=10`;
  const apiUrl = `https://app.scrapingbee.com/api/v1/?api_key=${SCRAPINGBEE_KEY}&url=${encodeURIComponent(targetUrl)}&premium_proxy=true&country_code=TR&wait_browser=render`;
  const timeout = setTimeout(() => { console.log('⏱ ScrapingBee timeout'); browserSearch(q, res, 0); }, 15000);
  https.get(apiUrl, { headers: { 'User-Agent': 'Remoce/1.0' } }, (r) => {
    let data = '';
    r.on('data', d => data += d);
    r.on('end', () => {
      clearTimeout(timeout);
      try {
        const json = JSON.parse(data);
        const html = json.body || json.result || json.raw_body || json.raw_html || '';
        if (!html || html.length < 200) return browserSearch(q, res, 0);
        const results = parseGoogleHtml(html);
        if (results.length > 0) { console.log(`🐝 ScrapingBee: "${q}" → ${results.length} sonuç`); return res.json({ results, query: q, engine: 'google' }); }
        browserSearch(q, res, 0);
      } catch { browserSearch(q, res, 0); }
    });
  }).on('error', () => { clearTimeout(timeout); browserSearch(q, res, 0); });
}

function parseGoogleHtml(html) {
  const results = [];
  const linkHrefRe = /<a[^>]*href="\/url\?q=([^&"]+)[^"]*"[^>]*>/g;
  const titleRe = /<h3[^>]*>(.*?)<\/h3>/g;
  const descRe = /<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  const links = []; let lm;
  while ((lm = linkHrefRe.exec(html)) !== null) { const u = decodeURIComponent(lm[1]); if (u.startsWith('http') && !u.includes('google.com') && !links.includes(u)) links.push(u); }
  const titles = []; let tm;
  while ((tm = titleRe.exec(html)) !== null) { titles.push(tm[1].replace(/<[^>]+>/g, '').trim()); }
  const descs = []; let dm;
  while ((dm = descRe.exec(html)) !== null) { descs.push(dm[1].replace(/<[^>]+>/g, '').trim()); }
  for (let i = 0; i < Math.min(links.length, 10); i++) { if (links[i] && titles[i]) results.push({ title: titles[i], url: links[i], desc: descs[i] || '', thumb: '' }); }
  return results;
}

// Browser API (ScrapingAnt) ile Google scraping
const BROWSER_KEYS = String(process.env.SCRAPINGANT_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);

function browserSearch(q, res, keyIdx = 0) {
  if (!BROWSER_KEYS.length) return duckSearch(q, res);
  if (keyIdx >= BROWSER_KEYS.length) return duckSearch(q, res);
  const key = BROWSER_KEYS[keyIdx];
  const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=tr&gl=TR&num=10`;
  const apiUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(targetUrl)}&x-api-key=${key}&browser=true&proxy_country=TR&wait_for_selector=h3`;
  const timeout = setTimeout(() => { console.log(`⏱ Browser Key ${keyIdx + 1} timeout`); browserSearch(q, res, keyIdx + 1); }, 15000);
  https.get(apiUrl, (r) => {
    let data = '';
    r.on('data', d => data += d);
    r.on('end', () => {
      clearTimeout(timeout);
      try {
        const json = JSON.parse(data);
        const html = json.result || json.data || json.content || '';
        if (!html || html.length < 200) return browserSearch(q, res, keyIdx + 1);
        const results = parseGoogleHtml(html);
        if (results.length > 0) { console.log(`🌐 Browser Key ${keyIdx + 1}: "${q}" → ${results.length} sonuç`); return res.json({ results, query: q, engine: 'google' }); }
        browserSearch(q, res, keyIdx + 1);
      } catch { browserSearch(q, res, keyIdx + 1); }
    });
  }).on('error', () => { clearTimeout(timeout); browserSearch(q, res, keyIdx + 1); });
}

function mojeekSearch(q, res) {
  const apiUrl = `https://api.mojeek.com/search?q=${encodeURIComponent(q)}&api_key=${MOJEEK_API_KEY}&fmt=json&safesearch=0&t=10`;
  https.get(apiUrl, (r) => {
    let data = '';
    r.on('data', d => data += d);
    r.on('end', () => {
      try {
        const json = JSON.parse(data);
        const results = (json.response?.results || []).map(item => ({
          title: item.title || '', url: item.url || '', desc: item.desc || '', thumb: '',
        }));
        if (results.length > 0) {
          console.log(`🔵 Mojeek: "${q}" → ${results.length} sonuç`);
          return res.json({ results, query: q, engine: 'mojeek' });
        }
      } catch {}
      duckSearch(q, res);
    });
  }).on('error', () => duckSearch(q, res));
}

// Bing Web Search Scraping — ücretsiz, gerçek web sonuçları
function duckSearch(q, res) {
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&mkt=tr-TR&count=10&setlang=tr`;
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'Accept-Encoding': 'identity',
    },
  };
  https.get(searchUrl, options, (r) => {
    let data = '';
    r.on('data', d => data += d);
    r.on('end', () => {
      try {
        const results = [];
        // Bing arama sonuçları parse et
        // <li class="b_algo"> içindeki h2 > a ve p.b_lineclamp2
        const algoRe = /<li class="b_algo"[\s\S]*?<\/li>/g;
        const hrefRe = /<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
        const descRe = /<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/;

        let block;
        while ((block = algoRe.exec(data)) !== null && results.length < 10) {
          const hm = hrefRe.exec(block[0]);
          const dm = descRe.exec(block[0]);
          if (hm) {
            const url = hm[1];
            const title = hm[2].replace(/<[^>]+>/g, '').trim();
            const desc = dm ? dm[1].replace(/<[^>]+>/g, '').trim() : '';
            if (url && title && url.startsWith('http') && !url.includes('bing.com') && !url.includes('microsoft.com')) {
              results.push({ title, url, desc, thumb: '' });
            }
          }
        }

        if (results.length > 0) {
          console.log(`🔵 Bing scrape: "${q}" → ${results.length} sonuç`);
          return res.json({ results, query: q, engine: 'bing' });
        }
        // Fallback: DuckDuckGo API
        ddgFallback(q, res);
      } catch (e) {
        console.error('Google scrape hatası:', e.message);
        ddgFallback(q, res);
      }
    });
  }).on('error', () => ddgFallback(q, res));
}

function ddgFallback(q, res) {
  const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&t=remoce`;
  https.get(apiUrl, { headers: { 'User-Agent': 'Remoce/1.0' } }, (r) => {
    let data = '';
    r.on('data', d => data += d);
    r.on('end', () => {
      try {
        const json = JSON.parse(data);
        const results = [];
        if (json.AbstractURL && json.Abstract && !json.AbstractURL.includes('duckduckgo.com')) {
          results.push({ title: json.Heading || q, url: json.AbstractURL, desc: json.Abstract, thumb: json.Image || '', featured: true });
        }
        (json.RelatedTopics || []).forEach(t => {
          if (t.FirstURL && t.Text && !t.FirstURL.includes('duckduckgo.com')) {
            results.push({ title: t.Text.split(' - ')[0] || t.Text, url: t.FirstURL, desc: t.Text, thumb: t.Icon?.URL || '' });
          } else if (t.Topics) {
            t.Topics.forEach(s => {
              if (s.FirstURL && s.Text && !s.FirstURL.includes('duckduckgo.com')) {
                results.push({ title: s.Text.split(' - ')[0] || s.Text, url: s.FirstURL, desc: s.Text, thumb: s.Icon?.URL || '' });
              }
            });
          }
        });
        console.log(`🦆 DDG fallback: "${q}" → ${results.length} sonuç`);
        res.json({ results: results.slice(0, 15), query: q, engine: 'duckduckgo' });
      } catch { res.json({ results: [], query: q, engine: 'duckduckgo' }); }
    });
  }).on('error', () => res.json({ results: [], query: q, engine: 'none' }));
}

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000, pingInterval: 25000,
});

app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

const rooms = {};

// ===== OYUN VERİTABANI =====
const RIDDLES = [
  { q: "Ben giderim o gider, arkamdan tık tık eder?", a: "gölge" },
  { q: "Dal üstünde al yanak, içi dolu boncuk?", a: "nar" },
  { q: "Mavi atlas, ipliksiz, düğmesiz?", a: "gökyüzü" },
  { q: "İçi kırmızı, dışı yeşil, tavşanın sevdiği şey?", a: "havuç" },
  { q: "Uçar kuş değil, gider at değil?", a: "bulut" },
  { q: "Ne ağzı var ne dili, konuşur insan gibi?", a: "kitap" },
  { q: "Küçücük bir kutu, içi dolu umut?", a: "yumurta" },
  { q: "Altı mermer, üstü mermer, içinde bir bülbül öter?", a: "ağız" },
  { q: "Gökte gördüm bir köprü, renkleri var yedi türlü?", a: "gökkuşağı" },
  { q: "Beyaz bir örtü, tüm dünyayı örttü?", a: "kar" },
  { q: "Daldan dala atlarım, kuyruğumdan sarkarım?", a: "maymun" },
  { q: "Uzaktan baktım bir taş, yanına vardım dört ayaklı bir kuş?", a: "kaplumbağa" },
  { q: "Sesi var canı yok, konuşur insan gibi?", a: "telefon" },
  { q: "İncecik beli, renkli teli, her gün elimizde?", a: "kalem" },
  { q: "Küçücük bir arı, her yere varır, her işe yarar?", a: "iğne" },
  { q: "Yer altında sakallı dede?", a: "pırasa" },
  { q: "İki camlı pencere, bakarım her sabah?", a: "gözlük" },
  { q: "Dağdan gelir, taştan gelir, bir kükremiş aslan gelir?", a: "sel" },
  { q: "Bir kutum var, içi daha dolu, gece açarım, gündüz kapatırım?", a: "göz" },
  { q: "Ben giderim o gelir, beni hiç yalnız koymaz?", a: "nefes" },
];

// ===== UNO KART DESTESİ =====
function createUnoDeck() {
  const colors = ['red', 'blue', 'green', 'yellow'];
  const deck = [];
  for (const color of colors) {
    deck.push({ color, value: '0', id: uuidv4() });
    for (let i = 1; i <= 9; i++) {
      deck.push({ color, value: String(i), id: uuidv4() });
      deck.push({ color, value: String(i), id: uuidv4() });
    }
    // Özel kartlar
    ['skip', 'reverse', '+2'].forEach(v => {
      deck.push({ color, value: v, id: uuidv4() });
      deck.push({ color, value: v, id: uuidv4() });
    });
  }
  // Vahşi kartlar
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild', id: uuidv4() });
    deck.push({ color: 'wild', value: '+4', id: uuidv4() });
  }
  return deck.sort(() => Math.random() - 0.5);
}

// ===== HAFIZA KARTLARI =====
const MEMORY_ICONS = ['🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥝','🌽','🥕','🍄','🌺','🌸','🌻','🌞','⭐','🎵','🎶','💎','🔮','🦋','🐝','🐞','🦄'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clearTimers(state) {
  if (!state) return;
  const timers = [];
  if (Array.isArray(state.timers)) timers.push(...state.timers);
  ['timer', 'goTimer', 'resultTimer'].forEach(k => { if (state[k]) timers.push(state[k]); });
  timers.forEach(t => { try { clearTimeout(t); } catch { } });
  if (Array.isArray(state.timers)) state.timers = [];
  ['timer', 'goTimer', 'resultTimer'].forEach(k => { if (state[k]) state[k] = null; });
}

function makeMathQuestion() {
  const ops = ['+', '-', '×'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a = 0;
  let b = 0;
  let answer = 0;
  if (op === '+') {
    a = Math.floor(Math.random() * 50) + 1;
    b = Math.floor(Math.random() * 50) + 1;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 50) + 10;
    b = Math.floor(Math.random() * 40) + 1;
    if (b > a) [a, b] = [b, a];
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 12) + 1;
    b = Math.floor(Math.random() * 12) + 1;
    answer = a * b;
  }
  return { text: `${a} ${op} ${b} = ?`, answer };
}

io.on('connection', (socket) => {
  console.log(`👤 Bağlandı: ${socket.id}`);

  socket.on('create-room', (username, callback) => {
    const roomId = uuidv4().substring(0, 6).toUpperCase();
    rooms[roomId] = { id: roomId, users: [{ id: socket.id, username, isAdmin: true }], game: null, gameState: null, browserState: { open: false, url: '' } };
    socket.join(roomId); socket.roomId = roomId;
    callback({ success: true, roomId });
    updateRoomUsers(roomId);
    io.to(socket.id).emit('browser-state', rooms[roomId].browserState);
    console.log(`🏠 Oda: ${roomId} - ${username}`);
  });

  socket.on('join-room', ({ roomId, username }, callback) => {
    const rid = String(roomId || '').toUpperCase();
    const room = rooms[rid];
    if (!room) return callback({ success: false, error: 'Oda bulunamadı!' });
    if (room.users.length >= 2) return callback({ success: false, error: 'Oda dolu!' });
    room.users.push({ id: socket.id, username, isAdmin: false });
    socket.join(rid); socket.roomId = rid;
    callback({ success: true, roomId: rid });
    io.to(rid).emit('peer-joined', { user: { id: socket.id, username }, users: room.users.map(u => ({ id: u.id, username: u.username, isAdmin: u.isAdmin })) });
    updateRoomUsers(rid);
    // Yeni katılana mevcut tarayıcı/youtube durumunu gönder
    io.to(socket.id).emit('browser-state', room.browserState || { open: false, url: '' });
    if (room.ytState?.videoId) {
      io.to(socket.id).emit('yt-load', { videoId: room.ytState.videoId, by: 'server' });
    }
    console.log(`🚪 ${username} katıldı: ${rid}`);
  });

  function updateRoomUsers(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    io.to(roomId).emit('room-users', room.users.map(u => ({ id: u.id, username: u.username, isAdmin: u.isAdmin })));
  }

  function initXox(roomId, room) {
    room.game = 'xox';
    room.gameState = { board: Array(9).fill(null), currentPlayer: room.users[0].id, moves: 0, winner: null, players: room.users.map(u => u.id) };
    io.to(roomId).emit('game-started-xox', { board: room.gameState.board, currentPlayer: room.gameState.currentPlayer });
    room.users.forEach((user, i) => { io.to(user.id).emit('game-your-symbol', { symbol: i === 0 ? 'X' : 'O', currentPlayer: room.gameState.currentPlayer }); });
  }

  function startRiddleRound(roomId, room, isFirst) {
    const s = room.gameState;
    clearTimers(s);
    s.answered = false;
    s.attempted = {};
    const item = s.riddles[s.round - 1];
    if (!item) return;
    s.current = item;
    s.deadline = Date.now() + 25000;
    const payload = { question: item.q, round: s.round, totalRounds: s.totalRounds, scores: { ...s.scores }, deadline: s.deadline };
    io.to(roomId).emit(isFirst ? 'game-started-riddle' : 'game-next-riddle', payload);
    s.timer = setTimeout(() => {
      const r = rooms[roomId];
      if (!r || r.game !== 'riddle') return;
      const st = r.gameState;
      if (st.answered) return;
      st.answered = true;
      io.to(roomId).emit('game-riddle-timeout', { answer: st.current.a, scores: { ...st.scores } });
      st.resultTimer = setTimeout(() => {
        const rr = rooms[roomId];
        if (!rr || rr.game !== 'riddle') return;
        const ss = rr.gameState;
        if (ss.round >= ss.totalRounds) {
          const sorted = Object.entries(ss.scores).sort((a, b) => b[1] - a[1]);
          io.to(roomId).emit('game-ended-riddle', { winner: sorted[0]?.[0] || null, winnerUsername: rr.users.find(u => u.id === sorted[0]?.[0])?.username, scores: { ...ss.scores } });
          rr.game = null; rr.gameState = null;
          return;
        }
        ss.round++;
        startRiddleRound(roomId, rr, false);
      }, 1400);
    }, 25000);
  }

  function startMathRound(roomId, room, isFirst) {
    const s = room.gameState;
    clearTimers(s);
    s.answers = {};
    s.question = makeMathQuestion();
    s.deadline = Date.now() + 12000;
    const payload = { question: s.question.text, round: s.round, totalRounds: s.totalRounds, scores: { ...s.scores }, deadline: s.deadline };
    io.to(roomId).emit(isFirst ? 'game-started-math' : 'game-next-math', payload);
    s.timer = setTimeout(() => resolveMathRound(roomId), 12000);
  }

  function resolveMathRound(roomId) {
    const room = rooms[roomId];
    if (!room || room.game !== 'math') return;
    const s = room.gameState;
    clearTimers(s);
    const correctAnswer = s.question?.answer;
    const answers = {};
    const correct = [];
    room.users.forEach(u => {
      const a = s.answers?.[u.id];
      const value = a?.value;
      const at = a?.at;
      const isCorrect = typeof value === 'number' && value === correctAnswer;
      answers[u.id] = { value: typeof value === 'number' ? value : null, correct: isCorrect, at: typeof at === 'number' ? at : null };
      if (isCorrect && typeof at === 'number') correct.push({ userId: u.id, at });
    });
    correct.sort((x, y) => x.at - y.at);
    const winner = correct[0]?.userId || null;
    if (winner) s.scores[winner] = (s.scores[winner] || 0) + 10;
    io.to(roomId).emit('game-math-result', {
      correctAnswer,
      answers,
      winner,
      winnerUsername: winner ? room.users.find(u => u.id === winner)?.username : null,
      scores: { ...s.scores },
      round: s.round,
      totalRounds: s.totalRounds,
    });
    s.resultTimer = setTimeout(() => {
      const r = rooms[roomId];
      if (!r || r.game !== 'math') return;
      const st = r.gameState;
      if (st.round >= st.totalRounds) {
        const sorted = Object.entries(st.scores).sort((a, b) => b[1] - a[1]);
        io.to(roomId).emit('game-ended-math', { winner: sorted[0]?.[0] || null, winnerUsername: r.users.find(u => u.id === sorted[0]?.[0])?.username, scores: { ...st.scores } });
        r.game = null; r.gameState = null;
        return;
      }
      st.round++;
      startMathRound(roomId, r, false);
    }, 1400);
  }

  function startReactionRound(roomId, room, isFirst) {
    const s = room.gameState;
    clearTimers(s);
    s.canClick = false;
    s.winner = null;
    s.goAt = null;
    io.to(roomId).emit(isFirst ? 'game-started-reaction' : 'game-next-reaction', { round: s.round, totalRounds: s.totalRounds, scores: { ...s.scores } });
    const delay = Math.floor(Math.random() * 2500) + 1500;
    s.goTimer = setTimeout(() => {
      const r = rooms[roomId];
      if (!r || r.game !== 'reaction') return;
      const st = r.gameState;
      st.canClick = true;
      st.goAt = Date.now();
      io.to(roomId).emit('game-reaction-go', { round: st.round, totalRounds: st.totalRounds });
      st.timer = setTimeout(() => {
        const rr = rooms[roomId];
        if (!rr || rr.game !== 'reaction') return;
        const ss = rr.gameState;
        if (!ss.canClick || ss.winner) return;
        ss.canClick = false;
        io.to(roomId).emit('game-reaction-result', { winner: null, winnerUsername: null, isDraw: true, reactionMs: null, scores: { ...ss.scores }, round: ss.round, totalRounds: ss.totalRounds });
        ss.resultTimer = setTimeout(() => {
          const rrr = rooms[roomId];
          if (!rrr || rrr.game !== 'reaction') return;
          const sss = rrr.gameState;
          if (sss.round >= sss.totalRounds) {
            const sorted = Object.entries(sss.scores).sort((a, b) => b[1] - a[1]);
            io.to(roomId).emit('game-ended-reaction', { winner: sorted[0]?.[0] || null, winnerUsername: rrr.users.find(u => u.id === sorted[0]?.[0])?.username, scores: { ...sss.scores } });
            rrr.game = null; rrr.gameState = null;
            return;
          }
          sss.round++;
          startReactionRound(roomId, rrr, false);
        }, 1200);
      }, 4500);
    }, delay);
  }

  // WebRTC
  socket.on('offer', ({ to, offer }) => io.to(to).emit('offer', { from: socket.id, offer }));
  socket.on('answer', ({ to, answer }) => io.to(to).emit('answer', { from: socket.id, answer }));
  socket.on('ice-candidate', ({ to, candidate }) => io.to(to).emit('ice-candidate', { from: socket.id, candidate }));

  socket.on('browser-open', ({ url }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const u = String(url || '').trim();
    room.browserState = { open: true, url: u };
    // Sadece odadaki diğer kişiye gönder
    const other = room.users.find(usr => usr.id !== socket.id);
    if (other) {
      io.to(other.id).emit('browser-open', { url: u, by: socket.id });
    }
    console.log(`🌐 Browser açıldı: ${socket.roomId} → ${u || '(boş)'}`);
  });

  socket.on('browser-navigate', ({ url }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const u = String(url || '').trim();
    room.browserState = { open: true, url: u };
    // Sadece diğer kişiye gönder (kendine değil)
    const other = room.users.find(usr => usr.id !== socket.id);
    if (other) {
      io.to(other.id).emit('browser-navigate', { url: u, by: socket.id });
    }
    console.log(`🌐 Navigate: ${socket.roomId} → ${u}`);
  });

  socket.on('browser-input', ({ text }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const other = room.users.find(usr => usr.id !== socket.id);
    if (other) io.to(other.id).emit('browser-input', { text, by: socket.id });
  });

  socket.on('browser-page-action', ({ action }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const other = room.users.find(usr => usr.id !== socket.id);
    if (other) io.to(other.id).emit('browser-page-action', { action, by: socket.id });
  });

  socket.on('rb-open', async () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!roomId || !room) return;
    try {
      const s = await ensureRemoteBrowser(roomId, io);
      io.to(socket.id).emit('rb-session', { ok: true, viewport: s.viewport, dpr: s.dpr });
    } catch (e) {
      io.to(socket.id).emit('rb-session', { ok: false, message: e?.message || 'Remote browser error' });
    }
  });

  socket.on('rb-close', async () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    await closeRemoteBrowser(roomId);
    io.to(roomId).emit('rb-session', { ok: false, message: 'closed' });
  });

  socket.on('rb-navigate', async ({ url }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!roomId || !room) return;
    const u = String(url || '').trim();
    if (!u) return;
    try {
      const s = await ensureRemoteBrowser(roomId, io);
      await s.page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => { });
    } catch { }
  });

  socket.on('rb-input', async (payload) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!roomId || !room) return;
    try {
      const s = await ensureRemoteBrowser(roomId, io);
      const p = payload || {};
      const x = Math.max(0, Math.min(Number(p.x) || 0, s.viewport.w));
      const y = Math.max(0, Math.min(Number(p.y) || 0, s.viewport.h));
      const button = p.button === 'right' ? 'right' : p.button === 'middle' ? 'middle' : 'left';

      if (p.kind === 'move') {
        await s.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button, modifiers: 0 }).catch(() => { });
      } else if (p.kind === 'down') {
        await s.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1, modifiers: 0 }).catch(() => { });
      } else if (p.kind === 'up') {
        await s.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1, modifiers: 0 }).catch(() => { });
      } else if (p.kind === 'wheel') {
        const dx = Number(p.dx) || 0;
        const dy = Number(p.dy) || 0;
        await s.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: dx, deltaY: dy, modifiers: 0 }).catch(() => { });
      }
    } catch { }
  });

  socket.on('rb-key', async (payload) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!roomId || !room) return;
    try {
      const s = await ensureRemoteBrowser(roomId, io);
      const p = payload || {};
      if (p.kind === 'type' && typeof p.text === 'string' && p.text) {
        await s.page.keyboard.insertText(p.text).catch(() => { });
        return;
      }
      const key = String(p.key || '');
      if (p.kind === 'down') {
        if (key.length === 1 && !p.ctrl && !p.alt && !p.meta) return;
        await s.page.keyboard.down(key).catch(() => { });
      } else if (p.kind === 'up') {
        await s.page.keyboard.up(key).catch(() => { });
      }
    } catch { }
  });

  socket.on('browser-close', () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    room.browserState = { open: false, url: room.browserState?.url || '' };
    const other = room.users.find(usr => usr.id !== socket.id);
    if (other) io.to(other.id).emit('browser-close', { by: socket.id });
    console.log(`🌐 Browser kapatıldı: ${socket.roomId}`);
    closeRemoteBrowser(socket.roomId);
  });

  // ===== YOUTUBE EŞ ZAMANLI =====
  socket.on('yt-open', () => {
    const room = rooms[socket.roomId];
    if (!room || room.users.length < 2) return;
    io.to(socket.roomId).emit('yt-open', { by: socket.id });
  });
  socket.on('yt-load', ({ videoId }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    room.ytState = { videoId, playing: false, time: 0 };
    io.to(socket.roomId).emit('yt-load', { videoId, by: socket.id });
  });
  socket.on('yt-play', ({ time }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    if (room.ytState) { room.ytState.playing = true; room.ytState.time = time || 0; }
    io.to(socket.roomId).emit('yt-play', { time: time || 0, by: socket.id });
  });
  socket.on('yt-pause', ({ time }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    if (room.ytState) { room.ytState.playing = false; room.ytState.time = time || 0; }
    io.to(socket.roomId).emit('yt-pause', { time: time || 0, by: socket.id });
  });
  socket.on('yt-seek', ({ time }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    if (room.ytState) room.ytState.time = time || 0;
    io.to(socket.roomId).emit('yt-seek', { time: time || 0, by: socket.id });
  });
  socket.on('yt-search', ({ query }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    io.to(socket.roomId).emit('yt-search', { query, by: socket.id });
  });

  socket.on('yt-close', () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    room.ytState = null;
    io.to(socket.roomId).emit('yt-close', { by: socket.id });
  });

  // === OYUN BAŞLATMA (Eş Zamanlı + Otomatik Init) ===
  socket.on('start-game', ({ game }) => {
    const room = rooms[socket.roomId];
    if (!room || room.users.length < 2) return;
    clearTimers(room.gameState);
    io.to(socket.roomId).emit('game-launch', { game, startedBy: socket.id });
    console.log(`🎮 Oyun: ${game} - ${socket.roomId}`);
    
    // Oyunu otomatik başlat (sadece başlatan kişi yapsın)
    if (game === 'xox') {
      initXox(socket.roomId, room);
    }
    if (game === 'rps') {
      room.game = 'rps'; room.gameState = { moves: {} };
      io.to(socket.roomId).emit('game-started-rps');
    }
    if (game === 'number') {
      const target = Math.floor(Math.random() * 100) + 1;
      room.game = 'number'; room.gameState = { target, hints: [], currentGuesser: room.users[0].id, finished: false };
      room.users.forEach((u, i) => io.to(u.id).emit('game-started-number', { yourTurn: i === 0 }));
    }
    if (game === 'uno') {
      const colors = ['red','blue','green','yellow'];
      let deck = [];
      for (const c of colors) {
        deck.push({ color: c, value: '0', id: uuidv4() });
        for (let i = 1; i <= 9; i++) { deck.push({ color: c, value: String(i), id: uuidv4() }); deck.push({ color: c, value: String(i), id: uuidv4() }); }
        ['skip','reverse','+2'].forEach(v => { deck.push({ color: c, value: v, id: uuidv4() }); deck.push({ color: c, value: v, id: uuidv4() }); });
      }
      for (let i = 0; i < 4; i++) { deck.push({ color: 'wild', value: 'wild', id: uuidv4() }); deck.push({ color: 'wild', value: '+4', id: uuidv4() }); }
      deck.sort(() => Math.random() - 0.5);
      const hands = {};
      room.users.forEach(u => { hands[u.id] = deck.splice(0, 7); });
      let topCard = deck.pop();
      while (topCard.color === 'wild') { deck.push(topCard); deck.sort(() => Math.random() - 0.5); topCard = deck.pop(); }
      room.game = 'uno'; room.gameState = { deck, hands, topCard, currentPlayer: room.users[0].id, direction: 1, winner: null };
      room.users.forEach(u => { io.to(u.id).emit('game-started-uno', { hand: hands[u.id], topCard, currentPlayer: room.gameState.currentPlayer, yourId: u.id }); });
    }
    if (game === 'memory') {
      const icons = ['🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥝','🌽','🥕','🍄','🌺','🌸','🌻','🌞','⭐'];
      const shuffled = [...icons].sort(() => Math.random() - 0.5).slice(0, 8);
      const cards = [...shuffled, ...shuffled].sort(() => Math.random() - 0.5).map((icon, i) => ({ id: i, icon, flipped: false, matched: false }));
      room.game = 'memory'; room.gameState = { cards, flippedIds: [], currentPlayer: room.users[0].id, scores: {}, matches: 0 };
      room.users.forEach(u => room.gameState.scores[u.id] = 0);
      room.users.forEach(u => io.to(u.id).emit('game-started-memory', { cards, currentPlayer: room.gameState.currentPlayer, yourId: u.id }));
    }
    if (game === 'dice') {
      room.game = 'dice'; room.gameState = { rolls: {}, scores: {}, round: 1 };
      room.users.forEach(u => room.gameState.scores[u.id] = 0);
      io.to(socket.roomId).emit('game-started-dice');
    }
    if (game === 'word') {
      const words = ['kitap','kalem','bilgi','yıldız','deniz','orman','renkli','müzik','resim','oyuncu','bahçe','şarkı','dansçı','yemek','tatlı'];
      const current = words[Math.floor(Math.random() * words.length)];
      const scrambled = current.split('').sort(() => Math.random() - 0.5).join('');
      room.game = 'word'; room.gameState = { currentWord: current, scrambled, currentPlayer: room.users[0].id, scores: {}, round: 1, guessedUsers: {} };
      room.users.forEach(u => room.gameState.scores[u.id] = 0);
      io.to(socket.roomId).emit('game-started-word', { scrambled: scrambled.toUpperCase(), currentPlayer: room.gameState.currentPlayer, round: 1 });
    }
    if (game === 'riddle') {
      room.game = 'riddle';
      room.gameState = { riddles: shuffle(RIDDLES).slice(0, 10), round: 1, totalRounds: 10, scores: {}, answered: false, attempted: {}, current: null, timer: null, resultTimer: null };
      room.users.forEach(u => room.gameState.scores[u.id] = 0);
      startRiddleRound(socket.roomId, room, true);
    }
    if (game === 'math') {
      room.game = 'math';
      room.gameState = { round: 1, totalRounds: 10, scores: {}, question: null, answers: {}, timer: null, resultTimer: null };
      room.users.forEach(u => room.gameState.scores[u.id] = 0);
      startMathRound(socket.roomId, room, true);
    }
    if (game === 'reaction') {
      room.game = 'reaction';
      room.gameState = { round: 1, totalRounds: 5, scores: {}, canClick: false, winner: null, goAt: null, timer: null, goTimer: null, resultTimer: null };
      room.users.forEach(u => room.gameState.scores[u.id] = 0);
      startReactionRound(socket.roomId, room, true);
    }
  });

  socket.on('game-start-riddle', () => {
    const room = rooms[socket.roomId];
    if (!room || room.users.length < 2) return;
    clearTimers(room.gameState);
    room.game = 'riddle';
    room.gameState = { riddles: shuffle(RIDDLES).slice(0, 10), round: 1, totalRounds: 10, scores: {}, answered: false, attempted: {}, current: null, timer: null, resultTimer: null };
    room.users.forEach(u => room.gameState.scores[u.id] = 0);
    startRiddleRound(socket.roomId, room, true);
  });

  socket.on('game-start-math', () => {
    const room = rooms[socket.roomId];
    if (!room || room.users.length < 2) return;
    clearTimers(room.gameState);
    room.game = 'math';
    room.gameState = { round: 1, totalRounds: 10, scores: {}, question: null, answers: {}, timer: null, resultTimer: null };
    room.users.forEach(u => room.gameState.scores[u.id] = 0);
    startMathRound(socket.roomId, room, true);
  });

  socket.on('game-start-reaction', () => {
    const room = rooms[socket.roomId];
    if (!room || room.users.length < 2) return;
    clearTimers(room.gameState);
    room.game = 'reaction';
    room.gameState = { round: 1, totalRounds: 5, scores: {}, canClick: false, winner: null, goAt: null, timer: null, goTimer: null, resultTimer: null };
    room.users.forEach(u => room.gameState.scores[u.id] = 0);
    startReactionRound(socket.roomId, room, true);
  });

  socket.on('game-start-xox', () => {
    const room = rooms[socket.roomId];
    if (!room || room.users.length < 2) return;
    clearTimers(room.gameState);
    initXox(socket.roomId, room);
  });

  socket.on('game-move-xox', ({ index }) => {
    const room = rooms[socket.roomId];
    if (!room || room.game !== 'xox') return;
    const state = room.gameState;
    if (state.winner || state.board[index] !== null || state.currentPlayer !== socket.id) return;
    const symbol = state.players[0] === socket.id ? 'X' : 'O';
    state.board[index] = symbol; state.moves++;
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const p of wins) { if (state.board[p[0]] && state.board[p[0]] === state.board[p[1]] && state.board[p[0]] === state.board[p[2]]) { state.winner = socket.id; break; } }
    const draw = !state.winner && state.moves >= 9;
    if (state.winner || draw) {
      const w = room.users.find(u => u.id === state.winner);
      io.to(socket.roomId).emit('game-ended-xox', { board: [...state.board], winner: state.winner, winnerUsername: w?.username, isDraw: draw });
      room.game = null; room.gameState = null; return;
    }
    state.currentPlayer = room.users.find(u => u.id !== socket.id).id;
    io.to(socket.roomId).emit('game-update-xox', { board: [...state.board], currentPlayer: state.currentPlayer });
  });

  socket.on('game-reset-xox', () => { const r = rooms[socket.roomId]; if (!r) return; r.game = null; r.gameState = null; io.to(socket.roomId).emit('game-closed-xox'); });

  // === TAŞ-KAĞIT-MAKAS ===
  socket.on('game-start-rps', () => { const r = rooms[socket.roomId]; if (!r || r.users.length < 2) return; r.game = 'rps'; r.gameState = { moves: {} }; io.to(socket.roomId).emit('game-started-rps'); });
  socket.on('game-move-rps', ({ move }) => {
    const room = rooms[socket.roomId]; if (!room || room.game !== 'rps' || room.gameState.moves[socket.id]) return;
    room.gameState.moves[socket.id] = move;
    if (Object.keys(room.gameState.moves).length === 2) {
      const [p1, p2] = room.users.map(u => u.id); const m1 = room.gameState.moves[p1]; const m2 = room.gameState.moves[p2];
      let w = 'draw'; if (m1 !== m2) w = ((m1==='rock'&&m2==='scissors')||(m1==='scissors'&&m2==='paper')||(m1==='paper'&&m2==='rock')) ? p1 : p2;
      io.to(socket.roomId).emit('game-result-rps', { moves: {...room.gameState.moves}, winner: w, isDraw: w==='draw', winnerUsername: room.users.find(u=>u.id===w)?.username });
      room.gameState.moves = {};
    }
  });
  socket.on('game-reset-rps', () => { const r = rooms[socket.roomId]; if (!r) return; r.game = null; r.gameState = null; io.to(socket.roomId).emit('game-closed-rps'); });

  // === SAYI TAHMIN ===
  socket.on('game-start-number', () => {
    const r = rooms[socket.roomId]; if (!r || r.users.length < 2) return;
    const target = Math.floor(Math.random() * 100) + 1;
    console.log(`🎯 Sayı: ${target}`);
    r.game = 'number'; r.gameState = { target, hints: [], currentGuesser: r.users[0].id, finished: false };
    r.users.forEach((u, i) => io.to(u.id).emit('game-started-number', { yourTurn: i === 0 }));
  });
  socket.on('game-guess-number', ({ guess }) => {
    const room = rooms[socket.roomId]; if (!room || room.game !== 'number' || room.gameState.finished) return;
    const s = room.gameState; const num = parseInt(guess); if (isNaN(num)) return;
    if (num === s.target) { s.finished = true; io.to(socket.roomId).emit('game-number-correct', { winner: socket.id, winnerUsername: room.users.find(u=>u.id===socket.id)?.username, target: s.target }); }
    else { const h = num < s.target ? '📈 Daha büyük!' : '📉 Daha küçük!'; s.hints.push({ userId: socket.id, guess: num, hint: h }); s.currentGuesser = room.users.find(u => u.id !== socket.id).id; io.to(socket.roomId).emit('game-number-hint', { hint: h, guess: num, userId: socket.id, nextGuesser: s.currentGuesser }); }
  });
  socket.on('game-reset-number', () => { const r = rooms[socket.roomId]; if (!r) return; r.game = null; r.gameState = null; io.to(socket.roomId).emit('game-closed-number'); });

  // === UNO ===
  socket.on('game-start-uno', () => {
    const room = rooms[socket.roomId]; if (!room || room.users.length < 2) return;
    const deck = createUnoDeck();
    const hands = {};
    room.users.forEach(u => { hands[u.id] = deck.splice(0, 7); });
    const topCard = deck.pop();
    let firstCard = topCard;
    if (topCard.color === 'wild') { deck.push(topCard); deck.sort(() => Math.random() - 0.5); firstCard = deck.pop(); }
    room.game = 'uno'; room.gameState = { deck, hands, topCard: firstCard, currentPlayer: room.users[0].id, direction: 1, winner: null };
    room.users.forEach(u => {
      const oppId = room.users.find(x => x.id !== u.id)?.id;
      io.to(u.id).emit('game-started-uno', {
        hand: hands[u.id], topCard: firstCard,
        currentPlayer: room.gameState.currentPlayer,
        yourId: u.id, opponentCards: oppId ? hands[oppId].length : 7
      });
    });
  });

  socket.on('game-play-uno', ({ cardId, chosenColor }) => {
    const room = rooms[socket.roomId]; if (!room || room.game !== 'uno') return;
    const s = room.gameState; if (s.winner || s.currentPlayer !== socket.id) return;
    const hand = s.hands[socket.id]; const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;
    const card = hand[cardIndex];
    const top = s.topCard;
    const canPlay = card.color === 'wild' || card.color === top.color || card.value === top.value;
    if (!canPlay) return;
    hand.splice(cardIndex, 1);
    const playedCard = { ...card };
    if (card.color === 'wild' && chosenColor) playedCard.color = chosenColor;
    s.topCard = playedCard;
    if (hand.length === 0) {
      s.winner = socket.id;
      io.to(socket.roomId).emit('game-ended-uno', { winner: socket.id, winnerUsername: room.users.find(u=>u.id===socket.id)?.username });
      room.game = null; room.gameState = null; return;
    }
    const nextPlayerIdx = (room.users.findIndex(u => u.id === socket.id) + 1) % room.users.length;
    s.currentPlayer = room.users[nextPlayerIdx].id;
    if (card.value === 'skip') { const skipIdx = (nextPlayerIdx + 1) % room.users.length; s.currentPlayer = room.users[skipIdx].id; }
    if (card.value === 'reverse') { s.direction *= -1; }
    if (card.value === '+2') { const target = room.users[nextPlayerIdx]; s.hands[target.id] = [...(s.hands[target.id] || []), ...s.deck.splice(0, 2)]; }
    if (card.value === '+4') { const target = room.users[nextPlayerIdx]; s.hands[target.id] = [...(s.hands[target.id] || []), ...s.deck.splice(0, 4)]; s.currentPlayer = room.users[nextPlayerIdx].id; }
    // Her oyuncuya kendi elini + rakibin kart sayısını gönder
    room.users.forEach(u => {
      const oppId = room.users.find(x => x.id !== u.id)?.id;
      io.to(u.id).emit('game-update-uno', {
        hand: s.hands[u.id], topCard: s.topCard,
        currentPlayer: s.currentPlayer,
        lastPlay: { userId: socket.id, card: playedCard },
        opponentCards: oppId ? (s.hands[oppId] || []).length : 0
      });
    });
  });

  socket.on('game-draw-uno', () => {
    const room = rooms[socket.roomId]; if (!room || room.game !== 'uno') return;
    const s = room.gameState; if (s.currentPlayer !== socket.id) return;
    if (s.deck.length === 0) { io.to(socket.roomId).emit('game-ended-uno', { winner: null, winnerUsername: null, isDraw: true }); room.game = null; room.gameState = null; return; }
    s.hands[socket.id] = [...(s.hands[socket.id] || []), s.deck.pop()];
    const nextIdx = (room.users.findIndex(u => u.id === socket.id) + 1) % room.users.length;
    s.currentPlayer = room.users[nextIdx].id;
    room.users.forEach(u => {
      const oppId = room.users.find(x => x.id !== u.id)?.id;
      io.to(u.id).emit('game-update-uno', {
        hand: s.hands[u.id], topCard: s.topCard,
        currentPlayer: s.currentPlayer,
        opponentCards: oppId ? (s.hands[oppId] || []).length : 0
      });
    });
  });

  socket.on('game-reset-uno', () => { const r = rooms[socket.roomId]; if (!r) return; r.game = null; r.gameState = null; io.to(socket.roomId).emit('game-closed-uno'); });

  // === HAFIZA (MEMORY) ===
  socket.on('game-start-memory', () => {
    const room = rooms[socket.roomId]; if (!room || room.users.length < 2) return;
    const icons = [...MEMORY_ICONS].sort(() => Math.random() - 0.5).slice(0, 8);
    const cards = [...icons, ...icons].sort(() => Math.random() - 0.5).map((icon, i) => ({ id: i, icon, flipped: false, matched: false }));
    room.game = 'memory'; room.gameState = { cards, flippedIds: [], currentPlayer: room.users[0].id, scores: {}, matches: 0 };
    room.users.forEach(u => room.gameState.scores[u.id] = 0);
    room.users.forEach(u => io.to(u.id).emit('game-started-memory', { cards, currentPlayer: room.gameState.currentPlayer, yourId: u.id }));
  });

  socket.on('game-flip-memory', ({ cardId }) => {
    const room = rooms[socket.roomId]; if (!room || room.game !== 'memory') return;
    const s = room.gameState; if (s.currentPlayer !== socket.id) return;
    const card = s.cards.find(c => c.id === cardId);
    if (!card || card.flipped || card.matched) return;
    if (s.flippedIds.length >= 2) return;
    card.flipped = true; s.flippedIds.push(cardId);
    io.to(socket.roomId).emit('game-update-memory', { cards: [...s.cards], currentPlayer: s.currentPlayer });
    if (s.flippedIds.length === 2) {
      const [id1, id2] = s.flippedIds;
      const c1 = s.cards.find(c => c.id === id1);
      const c2 = s.cards.find(c => c.id === id2);
      if (c1.icon === c2.icon) {
        c1.matched = true; c2.matched = true; s.matches++; s.scores[socket.id] = (s.scores[socket.id] || 0) + 10;
        s.flippedIds = [];
        io.to(socket.roomId).emit('game-update-memory', { cards: [...s.cards], currentPlayer: s.currentPlayer, match: true, scores: {...s.scores} });
        if (s.matches >= 8) {
          const sorted = Object.entries(s.scores).sort((a,b) => b[1]-a[1]);
          io.to(socket.roomId).emit('game-ended-memory', { winner: sorted[0][0], winnerUsername: room.users.find(u=>u.id===sorted[0][0])?.username, scores: {...s.scores} });
          room.game = null; room.gameState = null;
        }
      } else {
        // 1 saniye bekle, kartları kapat
        setTimeout(() => {
          c1.flipped = false; c2.flipped = false; s.flippedIds = [];
          const nextIdx = (room.users.findIndex(u => u.id === socket.id) + 1) % room.users.length;
          s.currentPlayer = room.users[nextIdx].id;
          io.to(socket.roomId).emit('game-update-memory', { cards: [...s.cards], currentPlayer: s.currentPlayer });
        }, 1200);
      }
    }
  });

  socket.on('game-reset-memory', () => { const r = rooms[socket.roomId]; if (!r) return; r.game = null; r.gameState = null; io.to(socket.roomId).emit('game-closed-memory'); });

  // === ZAR OYUNU ===
  socket.on('game-start-dice', () => {
    const room = rooms[socket.roomId]; if (!room || room.users.length < 2) return;
    room.game = 'dice';
    room.gameState = { rolls: {}, scores: {}, round: 1 };
    room.users.forEach(u => room.gameState.scores[u.id] = 0);
    io.to(socket.roomId).emit('game-started-dice');
  });

  socket.on('game-roll-dice', () => {
    const room = rooms[socket.roomId]; if (!room || room.game !== 'dice') return;
    const s = room.gameState;
    // Aynı turda zaten attıysa tekrar atamaz
    if (s.rolls[socket.id]) return;
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const total = d1 + d2;
    s.rolls[socket.id] = { d1, d2, total };
    // Sadece atan oyuncuya bildirim (rakip beklerken göster)
    const otherPlayer = room.users.find(u => u.id !== socket.id);
    // İki oyuncu da attıysa sonucu hesapla
    if (otherPlayer && s.rolls[otherPlayer.id]) {
      const myRoll = s.rolls[socket.id];
      const opRoll = s.rolls[otherPlayer.id];
      let winner = 'draw';
      if (myRoll.total > opRoll.total) winner = socket.id;
      else if (opRoll.total > myRoll.total) winner = otherPlayer.id;
      if (winner !== 'draw') s.scores[winner] = (s.scores[winner] || 0) + 1;
      const currentRound = s.round;
      s.round++;
      const gameOver = s.round > 5;
      io.to(socket.roomId).emit('game-result-dice', {
        rolls: { ...s.rolls },
        winner,
        isDraw: winner === 'draw',
        winnerUsername: winner !== 'draw' ? room.users.find(u => u.id === winner)?.username : null,
        scores: { ...s.scores },
        round: currentRound,
        gameOver,
      });
      s.rolls = {};
      if (gameOver) { room.game = null; room.gameState = null; }
    } else {
      // Sadece bu oyuncunun attığını herkese bildir
      io.to(socket.roomId).emit('game-player-rolled', { userId: socket.id, d1, d2, total });
    }
  });

  socket.on('game-reset-dice', () => { const r = rooms[socket.roomId]; if (!r) return; r.game = null; r.gameState = null; io.to(socket.roomId).emit('game-closed-dice'); });

  // === KELİME KARIŞTIRMA ===
  socket.on('game-start-word', () => {
    const room = rooms[socket.roomId]; if (!room || room.users.length < 2) return;
    const words = ['kitap','kalem','bilgi','yıldız','deniz','orman','renkli','müzik','resim','oyuncu','bahçe','şarkı','dansçı','yemek','tatlı'];
    const current = words[Math.floor(Math.random() * words.length)];
    const scrambled = current.split('').sort(() => Math.random() - 0.5).join('');
    room.game = 'word'; room.gameState = { currentWord: current, scrambled, currentPlayer: room.users[0].id, scores: {}, round: 1, guessedUsers: {} };
    room.users.forEach(u => room.gameState.scores[u.id] = 0);
    io.to(socket.roomId).emit('game-started-word', { scrambled: scrambled.toUpperCase(), currentPlayer: room.gameState.currentPlayer, round: 1 });
  });

  socket.on('game-guess-word', ({ guess }) => {
    const room = rooms[socket.roomId]; if (!room || room.game !== 'word') return;
    const s = room.gameState; if (s.currentPlayer !== socket.id || s.guessedUsers[socket.id]) return;
    const isCorrect = guess.toLowerCase().trim() === s.currentWord;
    if (isCorrect) {
      s.guessedUsers[socket.id] = true;
      s.scores[socket.id] = (s.scores[socket.id] || 0) + 10;
      io.to(socket.roomId).emit('game-word-correct', { userId: socket.id, username: room.users.find(u=>u.id===socket.id)?.username, word: s.currentWord, scores: {...s.scores} });
      setTimeout(() => {
        s.round++; s.guessedUsers = {};
        if (s.round > 8) {
          const sorted = Object.entries(s.scores).sort((a,b) => b[1]-a[1]);
          io.to(socket.roomId).emit('game-ended-word', { winner: sorted[0][0], winnerUsername: room.users.find(u=>u.id===sorted[0][0])?.username, scores: {...s.scores} });
          room.game = null; room.gameState = null; return;
        }
        const words2 = ['kitap','kalem','bilgi','yıldız','deniz','orman','renkli','müzik','resim','oyuncu','bahçe','şarkı','dansçı','yemek','tatlı'];
        const next = words2[Math.floor(Math.random() * words2.length)];
        const sc = next.split('').sort(() => Math.random() - 0.5).join('');
        s.currentWord = next; s.scrambled = sc;
        const nextP = (room.users.findIndex(u => u.id === socket.id) + 1) % room.users.length;
        s.currentPlayer = room.users[nextP].id;
        io.to(socket.roomId).emit('game-next-word', { scrambled: sc.toUpperCase(), currentPlayer: s.currentPlayer, round: s.round, scores: {...s.scores} });
      }, 2000);
    }
  });

  socket.on('game-reset-word', () => { const r = rooms[socket.roomId]; if (!r) return; r.game = null; r.gameState = null; io.to(socket.roomId).emit('game-closed-word'); });

  socket.on('game-answer-riddle', ({ answer }) => {
    const room = rooms[socket.roomId];
    if (!room || room.game !== 'riddle') return;
    const s = room.gameState;
    if (s.answered) return;
    if (s.attempted?.[socket.id]) return;
    s.attempted[socket.id] = true;
    const guess = String(answer || '').toLowerCase().trim();
    const correct = String(s.current?.a || '').toLowerCase().trim();
    if (guess && guess === correct) {
      s.answered = true;
      clearTimers(s);
      s.scores[socket.id] = (s.scores[socket.id] || 0) + 10;
      io.to(socket.roomId).emit('game-riddle-correct', { userId: socket.id, username: room.users.find(u => u.id === socket.id)?.username, answer: s.current.a, scores: { ...s.scores } });
      s.resultTimer = setTimeout(() => {
        const r = rooms[socket.roomId];
        if (!r || r.game !== 'riddle') return;
        const st = r.gameState;
        if (st.round >= st.totalRounds) {
          const sorted = Object.entries(st.scores).sort((a, b) => b[1] - a[1]);
          io.to(socket.roomId).emit('game-ended-riddle', { winner: sorted[0]?.[0] || null, winnerUsername: r.users.find(u => u.id === sorted[0]?.[0])?.username, scores: { ...st.scores } });
          r.game = null; r.gameState = null;
          return;
        }
        st.round++;
        startRiddleRound(socket.roomId, r, false);
      }, 1400);
      return;
    }
    io.to(socket.roomId).emit('game-riddle-wrong', { userId: socket.id, username: room.users.find(u => u.id === socket.id)?.username });
    const allTried = room.users.every(u => s.attempted?.[u.id]);
    if (allTried && !s.answered) {
      s.answered = true;
      clearTimers(s);
      io.to(socket.roomId).emit('game-riddle-reveal', { answer: s.current.a, scores: { ...s.scores } });
      s.resultTimer = setTimeout(() => {
        const r = rooms[socket.roomId];
        if (!r || r.game !== 'riddle') return;
        const st = r.gameState;
        if (st.round >= st.totalRounds) {
          const sorted = Object.entries(st.scores).sort((a, b) => b[1] - a[1]);
          io.to(socket.roomId).emit('game-ended-riddle', { winner: sorted[0]?.[0] || null, winnerUsername: r.users.find(u => u.id === sorted[0]?.[0])?.username, scores: { ...st.scores } });
          r.game = null; r.gameState = null;
          return;
        }
        st.round++;
        startRiddleRound(socket.roomId, r, false);
      }, 1200);
    }
  });

  socket.on('game-reset-riddle', () => {
    const r = rooms[socket.roomId];
    if (!r) return;
    clearTimers(r.gameState);
    r.game = null; r.gameState = null;
    io.to(socket.roomId).emit('game-closed-riddle');
  });

  socket.on('game-answer-math', ({ answer }) => {
    const room = rooms[socket.roomId];
    if (!room || room.game !== 'math') return;
    const s = room.gameState;
    if (s.answers?.[socket.id]) return;
    const val = Number.parseInt(answer, 10);
    s.answers[socket.id] = { value: Number.isFinite(val) ? val : null, at: Date.now() };
    const allAnswered = room.users.every(u => s.answers?.[u.id]);
    if (allAnswered) resolveMathRound(socket.roomId);
  });

  socket.on('game-reset-math', () => {
    const r = rooms[socket.roomId];
    if (!r) return;
    clearTimers(r.gameState);
    r.game = null; r.gameState = null;
    io.to(socket.roomId).emit('game-closed-math');
  });

  socket.on('game-click-reaction', () => {
    const room = rooms[socket.roomId];
    if (!room || room.game !== 'reaction') return;
    const s = room.gameState;
    if (s.winner) return;
    const other = room.users.find(u => u.id !== socket.id);
    if (!s.canClick) {
      if (!other) return;
      clearTimers(s);
      s.winner = other.id;
      s.scores[other.id] = (s.scores[other.id] || 0) + 1;
      io.to(socket.roomId).emit('game-reaction-result', { winner: other.id, winnerUsername: other.username, foulBy: socket.id, foulUsername: room.users.find(u => u.id === socket.id)?.username, isDraw: false, reactionMs: null, scores: { ...s.scores }, round: s.round, totalRounds: s.totalRounds });
      s.resultTimer = setTimeout(() => {
        const r = rooms[socket.roomId];
        if (!r || r.game !== 'reaction') return;
        const st = r.gameState;
        if (st.round >= st.totalRounds) {
          const sorted = Object.entries(st.scores).sort((a, b) => b[1] - a[1]);
          io.to(socket.roomId).emit('game-ended-reaction', { winner: sorted[0]?.[0] || null, winnerUsername: r.users.find(u => u.id === sorted[0]?.[0])?.username, scores: { ...st.scores } });
          r.game = null; r.gameState = null;
          return;
        }
        st.round++;
        startReactionRound(socket.roomId, r, false);
      }, 1200);
      return;
    }
    s.winner = socket.id;
    s.canClick = false;
    const reactionMs = s.goAt ? Date.now() - s.goAt : null;
    s.scores[socket.id] = (s.scores[socket.id] || 0) + 1;
    clearTimers(s);
    io.to(socket.roomId).emit('game-reaction-result', { winner: socket.id, winnerUsername: room.users.find(u => u.id === socket.id)?.username, foulBy: null, foulUsername: null, isDraw: false, reactionMs, scores: { ...s.scores }, round: s.round, totalRounds: s.totalRounds });
    s.resultTimer = setTimeout(() => {
      const r = rooms[socket.roomId];
      if (!r || r.game !== 'reaction') return;
      const st = r.gameState;
      if (st.round >= st.totalRounds) {
        const sorted = Object.entries(st.scores).sort((a, b) => b[1] - a[1]);
        io.to(socket.roomId).emit('game-ended-reaction', { winner: sorted[0]?.[0] || null, winnerUsername: r.users.find(u => u.id === sorted[0]?.[0])?.username, scores: { ...st.scores } });
        r.game = null; r.gameState = null;
        return;
      }
      st.round++;
      startReactionRound(socket.roomId, r, false);
    }, 1200);
  });

  socket.on('game-reset-reaction', () => {
    const r = rooms[socket.roomId];
    if (!r) return;
    clearTimers(r.gameState);
    r.game = null; r.gameState = null;
    io.to(socket.roomId).emit('game-closed-reaction');
  });

  // === BAĞLANTI KESİLME ===
  socket.on('disconnect', () => {
    const room = rooms[socket.roomId];
    if (room) {
      room.users = room.users.filter(u => u.id !== socket.id);
      if (room.gameState) { clearTimers(room.gameState); room.game = null; room.gameState = null; }
      if (room.users.length === 0) {
        closeRemoteBrowser(socket.roomId);
        delete rooms[socket.roomId];
        console.log(`🗑️ Oda silindi: ${socket.roomId}`);
      }
      else { io.to(socket.roomId).emit('peer-left', { userId: socket.id }); updateRoomUsers(socket.roomId); }
    }
    console.log(`🚫 Ayrıldı: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════╗`);
  console.log(`║   🚀 Remoce Server (React)      ║`);
  console.log(`╠══════════════════════════════════╣`);
  console.log(`║  Port: ${PORT}                      ║`);
  console.log(`║  Local: http://localhost:${PORT}     ║`);
  console.log(`╚══════════════════════════════════╝\n`);
});
