import React, { useCallback, useEffect, useRef, useState } from 'react';
import RemoteBrowser from './RemoteBrowser';

function isUrl(str) {
  return /^https?:\/\//i.test(str) || /^[\w-]+\.[\w.-]{2,}/i.test(str);
}

const BACKEND_BASE = String(import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');
const withBackend = (path) => (BACKEND_BASE ? `${BACKEND_BASE}${path}` : path);

export default function SharedBrowser({ socket, myId, localStream, initialUrl, onClose }) {
  const [mode, setMode] = useState('home');
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [browseUrl, setBrowseUrl] = useState('');
  const [phase, setPhase] = useState('loading');
  const [showBlocked, setShowBlocked] = useState(false);
  const [info, setInfo] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const mountedRef = useRef(true);
  const syncRef = useRef(null);
  const blockedTimerRef = useRef(null);
  const lastInitialUrlRef = useRef('');
  const infoTimerRef = useRef(null);

  useEffect(() => {
    clearTimeout(blockedTimerRef.current);
    if (phase !== 'loading' || mode !== 'browse') {
      setShowBlocked(false);
      return;
    }
    blockedTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setShowBlocked(true);
    }, 25000);
    return () => clearTimeout(blockedTimerRef.current);
  }, [phase, browseUrl, mode]);

  // Karşı taraftan gelen navigasyon
  useEffect(() => {
    if (!socket) return;
    mountedRef.current = true;

    const onnavigate = ({ url: u, by }) => {
      if (!mountedRef.current || by === myId) return;
      if (u.startsWith('search:')) {
        const q = u.replace('search:', '');
        setSearchInput(q);
        dosearch(q, false);
      } else if (u) {
        goSite(u, false);
      }
      setInfo('🔗 Rakip siteye gitti');
      clearTimeout(infoTimerRef.current);
      infoTimerRef.current = setTimeout(() => { if (mountedRef.current) setInfo(''); }, 2000);
    };

    const onopen = ({ url: u, by }) => {
      if (!mountedRef.current || by === myId) return;
      if (u?.startsWith('search:')) {
        const q = u.replace('search:', '');
        setSearchInput(q);
        dosearch(q, false);
      } else if (u) goSite(u, false);
    };

    const oninput = ({ text }) => {
      if (mountedRef.current) setSearchInput(text);
    };

    const onclose = () => { if (mountedRef.current) onClose(); };

    socket.on('browser-navigate', onnavigate);
    socket.on('browser-open', onopen);
    socket.on('browser-input', oninput);
    socket.on('browser-close', onclose);
    return () => {
      mountedRef.current = false;
      clearTimeout(infoTimerRef.current);
      socket.off('browser-navigate', onnavigate);
      socket.off('browser-open', onopen);
      socket.off('browser-input', oninput);
      socket.off('browser-close', onclose);
    };
  }, [socket, myId, onClose]);

  const dosearch = useCallback(async (q, emit = true) => {
    if (!q?.trim()) return;
    if (emit && socket) socket.emit('browser-navigate', { url: `search:${q.trim()}` });
    setMode('results');
    setSearching(true);
    setResults([]);
    setSearchError('');
    try {
      const res = await fetch(withBackend(`/search?q=${encodeURIComponent(q.trim())}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (mountedRef.current) setResults(data.results || []);
    } catch {
      if (mountedRef.current) {
        setSearchError('Arama sunucusuna baglanilamadi. Direkt arama sayfasini acabilirsin.');
        setResults([
          {
            title: `DuckDuckGo'da ara: ${q.trim()}`,
            url: `https://duckduckgo.com/?q=${encodeURIComponent(q.trim())}`,
            desc: 'Arama sonuclarini paylasimli tarayicida ac.',
          },
        ]);
      }
    }
    if (mountedRef.current) setSearching(false);
  }, [socket]);

  const goSite = useCallback((url, doemit = true) => {
    const u = isUrl(url) ? (url.startsWith('http') ? url : `https://${url}`) : null;
    if (!u) return;
    setBrowseUrl(u);
    setMode('browse');
    setPhase('loading');
    setShowBlocked(false);
    if (doemit && socket) socket.emit('browser-navigate', { url: u });
    if (socket) {
      socket.emit('rb-open');
      socket.emit('rb-navigate', { url: u });
    }
  }, [socket]);

  useEffect(() => {
    const u = String(initialUrl || '').trim();
    if (!u || u === lastInitialUrlRef.current) return;
    lastInitialUrlRef.current = u;
    if (u.startsWith('search:')) {
      const q = u.slice('search:'.length);
      setSearchInput(q);
      dosearch(q, false);
      return;
    }
    goSite(u, false);
  }, [initialUrl, dosearch, goSite]);

  const handleSubmit = useCallback(() => {
    const t = searchInput.trim();
    if (!t) return;
    if (isUrl(t)) {
      const url = t.startsWith('http') ? t : `https://${t}`;
      goSite(url, true);
    } else {
      dosearch(t, true);
    }
  }, [searchInput, goSite, dosearch]);

  const handleInput = useCallback((e) => {
    const v = e.target.value;
    setSearchInput(v);
    clearTimeout(syncRef.current);
    syncRef.current = setTimeout(() => {
      if (socket) socket.emit('browser-input', { text: v });
    }, 80);
  }, [socket]);

  const getTargetUrl = useCallback(() => browseUrl, [browseUrl]);

  const openNewTab = useCallback(() => {
    const target = getTargetUrl();
    if (!target) return;
    const finalUrl = target.startsWith('http') ? target : `https://${target}`;
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  }, [getTargetUrl]);

  useEffect(() => {
    if (!socket || mode !== 'browse') return;
    socket.emit('rb-open');
  }, [socket, mode]);

  const btnStyle = {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.85)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  const targetUrl = getTargetUrl();

  return (
    <div style={{ position: fullscreen ? 'fixed' : 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
      {/* Sağ üst butonlar */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', right: 'calc(env(safe-area-inset-right) + 12px)', zIndex: 200, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        {info && <span style={{ fontSize: 11, color: '#7dd3fc', background: 'rgba(0,0,0,0.7)', padding: '4px 10px', borderRadius: 8 }}>{info}</span>}
        {mode === 'browse' && !!browseUrl && (
          <button onClick={openNewTab} style={btnStyle} title="Yeni sekmede aç">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}
        <button onClick={() => setFullscreen(f => !f)} style={btnStyle}>
          {fullscreen ? (
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M15 9h4.5M15 9V4.5M9 15v4.5M9 15H4.5M15 15h4.5M15 15v4.5" />
            </svg>
          ) : (
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25 5.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          )}
        </button>
        <button onClick={() => { socket?.emit('browser-close'); socket?.emit('rb-close'); onClose(); }} style={{ ...btnStyle, color: '#f87171' }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ANA SAYFA / SONUÇLAR */}
      {mode !== 'browse' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Arama çubuğu */}
          <div style={{ padding: '32px 20px 12px', background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, maxWidth: 600, margin: '0 auto' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: '#1e293b', borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#64748b" strokeWidth={2} style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={searchInput}
                  onChange={handleInput}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#f1f5f9', fontSize: 14, minWidth: 0 }}
                  placeholder="Ara veya site adresi yaz..."
                  autoFocus
                />
              </div>
              <button onClick={handleSubmit} style={{ padding: '10px 18px', borderRadius: 12, background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>
                {isUrl(searchInput) ? 'Git' : 'Ara'}
              </button>
            </div>
            {mode === 'results' && (
              <p style={{ color: '#64748b', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
                Sonuca tıkla → siteye git • URL gir → direkt siteye git
              </p>
            )}
          </div>

          {/* Ana sayfa / Sonuçlar */}
          {mode === 'home' && !searching && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🔍</div>
              <h2 style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Paylaşımlı Tarayıcı</h2>
              <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center', maxWidth: 360 }}>
                Arama yap, siteye git — karşı taraf aynısını görür
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 }}>
                {[
                  { label: '🦆 Duck AI', url: 'https://duck.ai' },
                  { label: '🌐 Google', url: 'https://www.google.com' },
                  { label: '📄 Wikipedia', url: 'https://tr.wikipedia.org' },
                ].map(item => (
                  <button key={item.label} onClick={() => goSite(item.url)}
                    style={{ padding: '8px 16px', borderRadius: 20, background: '#1e293b', color: '#e2e8f0', fontSize: 13, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                    {item.label}
                  </button>
                ))}
              </div>
              <p style={{ color: '#475569', fontSize: 11, marginTop: 8 }}>
                Bazı siteler yine de kısıtlayabilir; sorun olursa yeni sekmede aç
              </p>
            </div>
          )}

          {/* Sonuçlar */}
          {mode === 'results' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {searching && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
                  <svg style={{ width: 32, height: 32, color: '#3b82f6', animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}
              {!searching && results.length === 0 && (
                <p style={{ color: '#475569', textAlign: 'center', paddingTop: 40, fontSize: 13 }}>Sonuç bulunamadı</p>
              )}
              {!searching && searchError && (
                <p style={{ color: '#f87171', textAlign: 'center', padding: '12px 0 16px', fontSize: 12 }}>{searchError}</p>
              )}
              <div style={{ maxWidth: 600, margin: '0 auto' }}>
                {results.map((r, i) => (
                  <div
                    key={i}
                    onClick={() => goSite(r.url)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      marginBottom: 6,
                      background: r.featured ? 'rgba(249,115,22,0.1)' : '#1e293b',
                      border: `1px solid ${r.featured ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.05)'}`,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#273449')}
                    onMouseLeave={e => (e.currentTarget.style.background = r.featured ? 'rgba(249,115,22,0.1)' : '#1e293b')}>
                    <div style={{ color: '#60a5fa', fontWeight: 600, fontSize: 14, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.desc}</div>
                    <div style={{ color: '#334155', fontSize: 10, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TARAMA MODU */}
      {mode === 'browse' && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Üst bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(8px)' }}>
            <button onClick={() => setMode(results.length > 0 ? 'results' : 'home')} style={{ ...btnStyle, width: 30, height: 30, background: 'transparent', border: 'none' }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            </button>
            <div style={{ flex: 1, background: '#1e293b', borderRadius: 8, padding: '5px 10px', fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {targetUrl.replace(/^https?:\/\//, '').slice(0, 80)}
            </div>
          </div>

          {/* Yükleniyor */}
          {phase === 'loading' && !showBlocked && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', gap: 12, pointerEvents: 'none' }}>
              <svg style={{ width: 36, height: 36, color: '#3b82f6', animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>Yükleniyor...</span>
            </div>
          )}

          {showBlocked && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,10,20,0.96)' }}>
              <div style={{ maxWidth: 300, margin: '0 16px', background: '#1e293b', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
                <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Tarayıcı yanıt vermiyor</div>
                <div style={{ color: '#64748b', fontSize: 12, marginBottom: 16 }}>
                  Sunucu tarafı tarayıcı yüklenemedi veya site çok ağır.
                </div>
                <button onClick={openNewTab} style={{ width: '100%', padding: 10, borderRadius: 10, background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer', marginBottom: 6 }}>
                  🔗 Yeni Sekmede Aç
                </button>
                <button onClick={() => setMode(results.length > 0 ? 'results' : 'home')} style={{ width: '100%', padding: 10, borderRadius: 10, background: '#334155', color: '#cbd5e1', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                  ← Geri Dön
                </button>
              </div>
            </div>
          )}

          <div style={{ position: 'absolute', inset: 0, paddingTop: 42 }}>
            <RemoteBrowser
              socket={socket}
              myId={myId}
              visible={mode === 'browse'}
              onReady={() => { setPhase('ready'); setShowBlocked(false); }}
            />
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
