import React, { useState, useEffect, useCallback, useRef } from 'react';

// ===== YouTube Data API v3 =====
const YT_API_KEY = 'AIzaSyDY-CXoz7FLo-eRbItvRFGkB0OYZ6dHgxk';

async function searchYouTube(query) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=12&key=${YT_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('API hatası');
  const data = await res.json();
  return (data.items || []).map(item => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    thumb: item.snippet.thumbnails?.medium?.url || `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
  }));
}

async function fetchTrending() {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=TR&maxResults=12&key=${YT_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('API hatası');
  const data = await res.json();
  return (data.items || []).map(item => ({
    id: item.id,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    thumb: item.snippet.thumbnails?.medium?.url || `https://img.youtube.com/vi/${item.id}/mqdefault.jpg`,
    views: item.statistics?.viewCount,
  }));
}

// ===== YouTube IFrame API Yükleyici =====
let ytApiReady = false;
const ytCallbacks = [];

function ensureYTApi() {
  if (ytApiReady && window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    ytCallbacks.push(resolve);
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    window.onYouTubeIframeAPIReady = () => {
      ytApiReady = true;
      ytCallbacks.forEach(cb => cb());
      ytCallbacks.length = 0;
    };
    if (window.YT?.Player) { ytApiReady = true; resolve(); }
  });
}

function extractVideoId(input) {
  const str = String(input || '').trim();
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = str.match(p);
    if (m) return m[1];
  }
  return null;
}

const CATEGORIES = [
  { label: '🔥 Trend', query: 'trend türkiye' },
  { label: '🎵 Müzik', query: 'türkçe müzik 2024' },
  { label: '🎮 Gaming', query: 'gaming highlights' },
  { label: '😂 Komedi', query: 'komedi eğlence' },
  { label: '⚽ Spor', query: 'spor maç özeti' },
  { label: '🎬 Film', query: 'film fragmanı 2024' },
];

function formatViews(n) {
  if (!n) return '';
  const num = parseInt(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M görüntülenme`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K görüntülenme`;
  return `${num} görüntülenme`;
}

export default function YoutubeSync({ socket, myId, localStream, onClose }) {
  const [phase, setPhase] = useState('discover'); // 'discover' | 'watch'
  const [searchInput, setSearchInput] = useState('');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState('');
  const [videoId, setVideoId] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [info, setInfo] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [pipVisible, setPipVisible] = useState(true);
  const [pipPos, setPipPos] = useState({ x: 16, y: 16 });
  const [pipDragging, setPipDragging] = useState(false);
  const pipDragRef = useRef({ sx: 0, sy: 0, ex: 0, ey: 0 });
  const playerContainerRef = useRef(null);
  const playerRef = useRef(null);
  const mountedRef = useRef(true);
  const syncLock = useRef(false);

  const showInfo = useCallback((msg) => {
    setInfo(msg);
    setTimeout(() => { if (mountedRef.current) setInfo(''); }, 2500);
  }, []);

  // Trend videoları yükle
  useEffect(() => {
    setLoading(true);
    fetchTrending()
      .then(v => { if (mountedRef.current) { setVideos(v); setLoading(false); } })
      .catch(() => { if (mountedRef.current) { setSearchError('Trend yüklenemedi'); setLoading(false); } });
    return () => { mountedRef.current = false; };
  }, []);

  // PIP sürükleme
  useEffect(() => {
    if (!pipDragging) return;
    const move = (e) => {
      const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      setPipPos({
        x: Math.max(0, Math.min(pipDragRef.current.ex + cx - pipDragRef.current.sx, window.innerWidth - 132)),
        y: Math.max(0, Math.min(pipDragRef.current.ey + cy - pipDragRef.current.sy, window.innerHeight - 100)),
      });
    };
    const up = () => setPipDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); };
  }, [pipDragging]);

  // YouTube player başlat - sabit ID ile
  const initPlayer = useCallback((vid, autoplay = true) => {
    setPlayerReady(false);
    // Varolan player'ı temizle
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
      playerRef.current = null;
    }

    const PLAYER_ID = 'yt-player-container';

    const createPlayer = () => {
      const el = document.getElementById(PLAYER_ID);
      if (!el || !mountedRef.current) return;
      el.innerHTML = '';
      const inner = document.createElement('div');
      inner.style.width = '100%';
      inner.style.height = '100%';
      el.appendChild(inner);

      playerRef.current = new window.YT.Player(inner, {
        videoId: vid,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: autoplay ? 1 : 0, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: (e) => {
            if (mountedRef.current) {
              setPlayerReady(true);
              if (autoplay) try { e.target.playVideo(); } catch {}
            }
          },
          onStateChange: (e) => {
            if (!mountedRef.current || syncLock.current) return;
            if (e.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              socket?.emit('yt-play', { time: playerRef.current?.getCurrentTime?.() || 0 });
            } else if (e.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
              socket?.emit('yt-pause', { time: playerRef.current?.getCurrentTime?.() || 0 });
            }
          },
          onError: () => {
            if (mountedRef.current) setPlayerReady(true); // Hata da olsa spinner'ı kaldır
          },
        },
      });
    };

    ensureYTApi().then(() => {
      if (!mountedRef.current) return;
      // DOM güncellemesi için kısa bekle
      setTimeout(createPlayer, 100);
    });
  }, [socket]);

  // Socket events
  useEffect(() => {
    if (!socket) return;
    mountedRef.current = true;

    const onLoad = ({ videoId: vid, title, by }) => {
      if (!mountedRef.current) return;
      setVideoId(vid); setVideoTitle(title || ''); setPhase('watch'); setIsPlaying(false);
      // Her iki taraf da player'ı başlat (autoplay=true ile hazır olsun)
      initPlayer(vid, true);
      if (by !== myId) showInfo('🎬 Rakip video açtı');
    };
    const onPlay = ({ time, by }) => {
      if (!mountedRef.current || by === myId) return;
      syncLock.current = true;
      setIsPlaying(true);
      try { playerRef.current?.seekTo?.(time || 0, true); playerRef.current?.playVideo?.(); } catch {}
      showInfo('▶ Rakip oynatıyor');
      setTimeout(() => { syncLock.current = false; }, 600);
    };
    const onPause = ({ time, by }) => {
      if (!mountedRef.current || by === myId) return;
      syncLock.current = true;
      setIsPlaying(false);
      try { playerRef.current?.seekTo?.(time || 0, true); playerRef.current?.pauseVideo?.(); } catch {}
      showInfo('⏸ Rakip durdurdu');
      setTimeout(() => { syncLock.current = false; }, 600);
    };
    const onSeek = ({ time, by }) => {
      if (!mountedRef.current || by === myId) return;
      try { playerRef.current?.seekTo?.(time || 0, true); } catch {}
      showInfo(`⏩ ${Math.floor(time)}s'ye atlandı`);
    };
    const onClose2 = () => { if (mountedRef.current) onClose(); };

    socket.on('yt-load', onLoad);
    socket.on('yt-play', onPlay);
    socket.on('yt-pause', onPause);
    socket.on('yt-seek', onSeek);
    socket.on('yt-close', onClose2);
    return () => {
      mountedRef.current = false;
      socket.off('yt-load', onLoad);
      socket.off('yt-play', onPlay);
      socket.off('yt-pause', onPause);
      socket.off('yt-seek', onSeek);
      socket.off('yt-close', onClose2);
      try { playerRef.current?.destroy?.(); } catch {}
    };
  }, [socket, myId, onClose, initPlayer, showInfo]);

  const openVideo = useCallback((vid, title = '') => {
    setVideoId(vid); setVideoTitle(title); setPhase('watch'); setIsPlaying(false);
    initPlayer(vid, true);
    socket?.emit('yt-load', { videoId: vid, title });
  }, [socket, initPlayer]);

  const handleSearch = useCallback(async () => {
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    const vid = extractVideoId(trimmed);
    if (vid) { openVideo(vid, ''); return; }
    setLoading(true); setSearchError('');
    try {
      const results = await searchYouTube(trimmed);
      if (mountedRef.current) { setVideos(results); setLoading(false); }
    } catch {
      if (mountedRef.current) { setSearchError('Arama başarısız'); setLoading(false); }
    }
  }, [searchInput, openVideo]);

  const handleCategorySearch = useCallback(async (query) => {
    setSearchInput(query); setLoading(true); setSearchError('');
    try {
      const results = await searchYouTube(query);
      if (mountedRef.current) { setVideos(results); setLoading(false); }
    } catch {
      if (mountedRef.current) { setSearchError('Yüklenemedi'); setLoading(false); }
    }
  }, []);

  const handlePlay = useCallback(() => {
    try { playerRef.current?.playVideo?.(); setIsPlaying(true); socket?.emit('yt-play', { time: playerRef.current?.getCurrentTime?.() || 0 }); } catch {}
  }, [socket]);

  const handlePause = useCallback(() => {
    try { playerRef.current?.pauseVideo?.(); setIsPlaying(false); socket?.emit('yt-pause', { time: playerRef.current?.getCurrentTime?.() || 0 }); } catch {}
  }, [socket]);

  const handleSeek = useCallback((delta) => {
    try {
      const t = Math.max(0, (playerRef.current?.getCurrentTime?.() || 0) + delta);
      playerRef.current?.seekTo?.(t, true);
      socket?.emit('yt-seek', { time: t });
    } catch {}
  }, [socket]);

  return (
    <div className={fullscreen ? 'fixed inset-0 z-[60] flex flex-col bg-black' : 'absolute inset-0 z-50 flex flex-col bg-black'}>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0f0f0f] border-b border-white/10 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-bold flex-shrink-0">▶</div>

        <div className="flex-1 flex items-center gap-2 bg-gray-800 rounded-2xl px-3 py-1.5 border border-white/10 min-w-0">
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1 bg-transparent outline-none text-white text-xs placeholder-gray-500 min-w-0"
            placeholder="Video ara veya YouTube linki yapıştır..." />
          {searchInput && (
            <button onClick={handleSearch}
              className="flex-shrink-0 px-3 py-0.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold active:scale-95 transition-all">
              Ara
            </button>
          )}
        </div>

        {localStream && (
          <button onClick={() => setPipVisible(v => !v)}
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border border-white/10 text-sm transition-colors ${pipVisible ? 'bg-green-600/30 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
            📷
          </button>
        )}

        <button onClick={() => setFullscreen(f => !f)}
          className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center border border-white/10 transition-colors">
          {fullscreen
            ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M15 9h4.5M15 9V4.5M9 15v4.5M9 15H4.5M15 15h4.5M15 15v4.5" /></svg>
            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25 5.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>}
        </button>

        <button onClick={() => { socket?.emit('yt-close'); onClose(); }}
          className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 text-red-400 hover:bg-red-500/10 flex items-center justify-center border border-white/10">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {info && <div className="px-3 py-1 bg-[#0f0f0f] text-xs text-sky-400 border-b border-white/5 flex-shrink-0">{info}</div>}

      {/* Keşfet ekranı */}
      {phase === 'discover' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0f0f0f]">
          {/* Kategori butonları */}
          <div className="flex gap-2 px-3 py-2 border-b border-white/5 overflow-x-auto flex-shrink-0">
            <button onClick={() => { setSearchInput(''); fetchTrending().then(v => { if (mountedRef.current) setVideos(v); }).catch(() => {}); }}
              className="flex-shrink-0 px-3 py-1 rounded-full bg-red-600 text-white text-xs font-medium active:scale-95">
              🔥 Trend
            </button>
            {CATEGORIES.slice(1).map(cat => (
              <button key={cat.query} onClick={() => handleCategorySearch(cat.query)}
                className="flex-shrink-0 px-3 py-1 rounded-full bg-gray-800 hover:bg-gray-700 text-white text-xs active:scale-95 border border-white/10 transition-all">
                {cat.label}
              </button>
            ))}
          </div>

          {/* Video listesi */}
          <div className="flex-1 overflow-y-auto p-3">
            {loading && (
              <div className="flex items-center justify-center py-16">
                <svg className="w-8 h-8 text-red-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
            )}
            {searchError && <p className="text-red-400 text-xs text-center py-4">{searchError}</p>}
            {!loading && videos.length === 0 && !searchError && (
              <p className="text-gray-500 text-xs text-center py-8">Video bulunamadı</p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {videos.map(v => (
                <button key={v.id} onClick={() => openVideo(v.id, v.title)}
                  className="text-left rounded-xl overflow-hidden bg-gray-900 border border-white/5 hover:border-red-500/40 active:scale-95 transition-all group">
                  <div className="relative">
                    <img src={v.thumb} alt={v.title} className="w-full aspect-video object-cover group-hover:brightness-110 transition-all" loading="lazy" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-10 h-10 rounded-full bg-red-600/90 flex items-center justify-center text-white font-bold text-sm">▶</div>
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-white text-xs font-medium line-clamp-2 leading-tight">{v.title}</p>
                    <p className="text-gray-500 text-[10px] mt-0.5 truncate">{v.channel}</p>
                    {v.views && <p className="text-gray-600 text-[9px]">{formatViews(v.views)}</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* İzleme ekranı */}
      {phase === 'watch' && (
        <div className="flex-1 flex flex-col bg-black overflow-hidden">
          {videoTitle && (
            <div className="px-3 py-1.5 bg-[#0f0f0f] text-xs text-gray-300 border-b border-white/5 flex-shrink-0 truncate flex items-center gap-2">
              <span className="text-red-500">▶</span> {videoTitle}
              <button onClick={() => setPhase('discover')} className="ml-auto text-gray-500 hover:text-white text-[10px] flex-shrink-0">← Keşfet</button>
            </div>
          )}

          <div className="flex-1 relative bg-black">
            {!playerReady && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black gap-3">
                <svg className="w-10 h-10 text-red-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span className="text-gray-400 text-sm">Video yükleniyor...</span>
              </div>
            )}
            <div id="yt-player-container" className="w-full h-full" />
          </div>

          <div className="flex-shrink-0 bg-[#0f0f0f] border-t border-white/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <button onClick={isPlaying ? handlePause : handlePlay} disabled={!playerReady}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold transition-all active:scale-90 disabled:opacity-40 ${isPlaying ? 'bg-yellow-500 text-black' : 'bg-red-600 text-white'}`}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button onClick={() => handleSeek(-10)} disabled={!playerReady}
                className="px-2.5 py-1 rounded-lg bg-gray-800 text-white text-xs font-mono disabled:opacity-40 active:scale-90 border border-white/10">-10s</button>
              <button onClick={() => handleSeek(10)} disabled={!playerReady}
                className="px-2.5 py-1 rounded-lg bg-gray-800 text-white text-xs font-mono disabled:opacity-40 active:scale-90 border border-white/10">+10s</button>
              <div className="flex-1" />
              <span className={`text-xs px-2 py-1 rounded-lg ${isPlaying ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                {isPlaying ? '▶ Oynatılıyor' : '⏸ Durdu'}
              </span>
            </div>
            <p className="text-[10px] text-gray-600 text-center mt-1">İki kişi de kontrol edebilir • Eş zamanlı</p>
          </div>
        </div>
      )}

      {/* Kamera PIP */}
      {localStream && pipVisible && (
        <div
          className="fixed z-[70] w-32 h-24 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 cursor-grab active:cursor-grabbing select-none"
          style={{ left: pipPos.x, top: pipPos.y, touchAction: 'none' }}
          onMouseDown={e => { setPipDragging(true); pipDragRef.current = { sx: e.clientX, sy: e.clientY, ex: pipPos.x, ey: pipPos.y }; }}
          onTouchStart={e => { setPipDragging(true); pipDragRef.current = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, ex: pipPos.x, ey: pipPos.y }; }}>
          <video autoPlay muted playsInline className="w-full h-full object-cover"
            ref={el => { if (el && localStream) el.srcObject = localStream; }} />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 flex items-center justify-between">
            <span className="text-white/70 text-[9px]">📷</span>
            <button onMouseDown={e => e.stopPropagation()} onClick={() => setPipVisible(false)}
              className="text-white/60 hover:text-white text-[9px] w-4 h-4 flex items-center justify-center">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
