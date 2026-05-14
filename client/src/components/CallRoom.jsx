import React, { useRef, useEffect, useState, useCallback } from 'react';
import XoxGame from './XoxGame';
import RpsGame from './RpsGame';
import NumberGame from './NumberGame';
import RiddleGame from './RiddleGame';
import UnoGame from './UnoGame';
import MemoryGame from './MemoryGame';
import DiceGame from './DiceGame';
import WordGame from './WordGame';
import MathGame from './MathGame';
import ReactionGame from './ReactionGame';
import SharedBrowser from './SharedBrowser';
import YoutubeSync from './YoutubeSync';

export default function CallRoom({
  roomId, username, myId, localStream, remoteStream,
  micEnabled, camEnabled, users, socket,
  onToggleMic, onToggleCam, onLeave,
}) {
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const [showControls, setShowControls] = useState(true);
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [activeGame, setActiveGame] = useState(null);
  // 'browser' | 'youtube' | null
  const [activePanel, setActivePanel] = useState(null);
  const [browserUrl, setBrowserUrl] = useState('');
  // WhatsApp tap-to-switch: true = uzak kamera büyük, false = kendi kameran büyük
  const [localBig, setLocalBig] = useState(false);
  const [pipExpanded, setPipExpanded] = useState(false);
  const controlsTimeout = useRef(null);

  // Uzak video stream'i bağla
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Yerel video stream'i bağla
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Kontrol çubuğu gizleme
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resetControlsTimer);
    window.addEventListener('touchstart', resetControlsTimer);
    return () => {
      window.removeEventListener('mousemove', resetControlsTimer);
      window.removeEventListener('touchstart', resetControlsTimer);
      clearTimeout(controlsTimeout.current);
    };
  }, [resetControlsTimer]);

  // Oyun başlatma
  useEffect(() => {
    if (!socket) return;
    const handler = ({ game }) => { setActiveGame(game); setShowGameMenu(false); };
    socket.on('game-launch', handler);
    return () => socket.off('game-launch', handler);
  }, [socket]);

  const launchGame = useCallback((game) => { socket.emit('start-game', { game }); }, [socket]);
  const closeGame = () => setActiveGame(null);

  // ===== TARAYICI & YOUTUBE SENKRONIZASYONU =====
  useEffect(() => {
    if (!socket) return;

    // Tarayıcı olayları
    const onBrowserOpen = ({ url }) => {
      const u = url || '';
      setBrowserUrl(u);
      setActivePanel('browser');
    };
    const onBrowserNavigate = ({ url }) => {
      if (!url) return;
      setBrowserUrl(url);
      setActivePanel('browser');
    };
    const onBrowserState = ({ open, url }) => {
      if (open && url) { setBrowserUrl(url); setActivePanel('browser'); }
      else if (!open) setActivePanel(p => p === 'browser' ? null : p);
    };
    const onBrowserClose = () => setActivePanel(p => p === 'browser' ? null : p);

    // YouTube olayları
    const onYtOpen = () => setActivePanel('youtube');
    const onYtLoad = () => setActivePanel('youtube');
    const onYtClose = () => setActivePanel(p => p === 'youtube' ? null : p);

    socket.on('browser-open', onBrowserOpen);
    socket.on('browser-navigate', onBrowserNavigate);
    socket.on('browser-state', onBrowserState);
    socket.on('browser-close', onBrowserClose);
    socket.on('yt-open', onYtOpen);
    socket.on('yt-load', onYtLoad);
    socket.on('yt-close', onYtClose);

    return () => {
      socket.off('browser-open', onBrowserOpen);
      socket.off('browser-navigate', onBrowserNavigate);
      socket.off('browser-state', onBrowserState);
      socket.off('browser-close', onBrowserClose);
      socket.off('yt-open', onYtOpen);
      socket.off('yt-load', onYtLoad);
      socket.off('yt-close', onYtClose);
    };
  }, [socket]);

  const openBrowser = useCallback(() => {
    setBrowserUrl('');
    setActivePanel('browser');
    if (socket) socket.emit('browser-open', { url: '' });
  }, [socket]);

  const closeBrowser = useCallback(() => {
    setActivePanel(null);
    if (socket) socket.emit('browser-close');
  }, [socket]);

  const openYoutube = useCallback(() => {
    setActivePanel('youtube');
    if (socket) socket.emit('yt-open');
  }, [socket]);

  const closeYoutube = useCallback(() => {
    setActivePanel(null);
    if (socket) socket.emit('yt-close');
  }, [socket]);

  const games = [
    { id: 'xox', icon: '❌', title: 'XOX', desc: 'Klasik üç taş', color: 'from-purple-500 to-pink-500' },
    { id: 'rps', icon: '🪨', title: 'Taş-Kağıt-Makas', desc: 'Klasik el oyunu', color: 'from-yellow-500 to-orange-500' },
    { id: 'number', icon: '🔢', title: 'Sayı Tahmin', desc: '1-100 sayı bul', color: 'from-blue-500 to-cyan-500' },
    { id: 'riddle', icon: '🎯', title: 'Bilmece', desc: 'Bilmeceleri çöz', color: 'from-green-500 to-emerald-500' },
    { id: 'uno', icon: '🃏', title: 'UNO', desc: 'Kart oyunu', color: 'from-red-500 to-rose-500' },
    { id: 'memory', icon: '🧠', title: 'Hafıza', desc: 'Kart eşleştirme', color: 'from-teal-500 to-cyan-500' },
    { id: 'dice', icon: '🎲', title: 'Zar Oyunu', desc: 'Zar at yarış', color: 'from-indigo-500 to-purple-500' },
    { id: 'word', icon: '📝', title: 'Kelime Bulmaca', desc: 'Karışık kelime', color: 'from-pink-500 to-rose-500' },
    { id: 'math', icon: '➕', title: 'Hızlı Matematik', desc: 'En hızlı çöz', color: 'from-cyan-500 to-blue-500' },
    { id: 'reaction', icon: '⚡', title: 'Refleks Düellosu', desc: 'GO deyince tıkla', color: 'from-orange-500 to-red-500' },
  ];

  return (
    <div className="w-full h-full relative overflow-hidden bg-black" onClick={resetControlsTimer}>

      {/* ===== ANA VİDEO ALANI (WhatsApp tap-to-switch düzeni) ===== */}
      {/* Büyük video — tam ekran arka plan */}
      {localBig ? (
        /* Kendi kameran büyük */
        localStream ? (
          <video ref={localVideoRef} autoPlay muted playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)', objectPosition: 'center 38%' }} /* Mirror: selfie preview */
          />
        ) : (
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
            <p className="text-gray-400">Kamera yok</p>
          </div>
        )
      ) : (
        /* Uzak kamera büyük */
        remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: 'center 38%' }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-700 flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <p className="text-gray-300 text-lg font-medium">Karşı taraf bağlanıyor...</p>
              <p className="text-gray-500 text-sm mt-1">Oda: {roomId}</p>
            </div>
          </div>
        )
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 pointer-events-none" />

      {activePanel !== 'youtube' && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Kamera penceresi"
          onClick={() => setLocalBig(b => !b)}
          className={`fixed z-[300] rounded-2xl overflow-hidden shadow-2xl border-2 border-white/30 cursor-pointer active:scale-95 transition-all bg-black ${pipExpanded ? 'w-64 h-40 sm:w-72 sm:h-44' : 'w-40 h-24 sm:w-44 sm:h-28'}`}
          style={{ right: 'calc(env(safe-area-inset-right) + 1rem)', bottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
          title="Tikla: tam ekran kamerayi degistir">
          {localBig ? (
            remoteStream ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" style={{ objectPosition: 'center 38%' }} />
            ) : (
              <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
            )
          ) : (
            localStream ? (
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)', objectPosition: 'center 38%' }} />
            ) : (
              <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V9m12.841 9.091L16.5 19.5m-1.409-1.409c.407-.407.659-.97.659-1.591v-1.5a2.25 2.25 0 00-2.25-2.25h-1.5" />
                </svg>
              </div>
            )
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setPipExpanded(v => !v); }}
            className="absolute top-1 left-1 w-7 h-7 rounded-full bg-black/45 flex items-center justify-center"
            title={pipExpanded ? 'Kucult' : 'Buyut'}>
            {pipExpanded ? (
              <svg className="w-4 h-4 text-white/75" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9H4.5M9 9V4.5M15 9h4.5M15 9V4.5M9 15v4.5M9 15H4.5M15 15h4.5M15 15v4.5" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white/75" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 8.25v-4.5m0 0h4.5m-4.5 0L9 9m11.25-.75v-4.5m0 0h-4.5m4.5 0L15 9M3.75 15.75v4.5m0 0h4.5m-4.5 0L9 15m11.25.75v4.5m0 0h-4.5m4.5 0L15 15" />
              </svg>
            )}
          </button>
          {!camEnabled && !localBig && (
            <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V9" />
              </svg>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setLocalBig(b => !b); }}
            className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center"
            title="Tam ekran kamerayi degistir">
            <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </button>
          <div className="absolute bottom-1 left-0 right-0 text-center pointer-events-none">
            <span className="text-white/80 text-[9px] font-medium bg-black/40 px-1 py-0.5 rounded">
              {localBig ? 'Rakip' : username} - tikla
            </span>
          </div>
        </div>
      )}

      {/* ===== KONTROL ÇUBUĞU — Alt (WhatsApp düzeni) ===== */}
      <div className={`absolute bottom-0 left-0 right-0 z-20 transition-all duration-500 ${showControls || activePanel ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
        <div className="flex items-center justify-center gap-4 pb-8 pt-14 px-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent">

          {/* Mikrofon */}
          <button onClick={onToggleMic}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${micEnabled ? 'bg-white/20 backdrop-blur text-white hover:bg-white/30' : 'bg-red-500 text-white hover:bg-red-600'}`}>
            {micEnabled ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} />
              </svg>
            )}
          </button>

          {/* Kamera */}
          <button onClick={onToggleCam}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${camEnabled ? 'bg-white/20 backdrop-blur text-white hover:bg-white/30' : 'bg-red-500 text-white hover:bg-red-600'}`}>
            {camEnabled ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V9m12.841 9.091L16.5 19.5m-1.409-1.409c.407-.407.659-.97.659-1.591v-1.5a2.25 2.25 0 00-2.25-2.25h-1.5" />
              </svg>
            )}
          </button>

          {/* Oyunlar */}
          <button onClick={() => setShowGameMenu(true)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg text-2xl ${showGameMenu ? 'bg-green-500 text-white' : 'bg-white/20 backdrop-blur text-white hover:bg-white/30'}`}>
            🎮
          </button>

          {/* Web Tarayıcı */}
          <button onClick={activePanel === 'browser' ? closeBrowser : openBrowser}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg text-2xl ${activePanel === 'browser' ? 'bg-sky-500 text-white' : 'bg-white/20 backdrop-blur text-white hover:bg-white/30'}`}>
            🌐
          </button>

          {/* YouTube */}
          <button onClick={activePanel === 'youtube' ? closeYoutube : openYoutube}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg text-2xl ${activePanel === 'youtube' ? 'bg-red-600 text-white' : 'bg-white/20 backdrop-blur text-white hover:bg-white/30'}`}>
            ▶
          </button>

          {/* Görüşmeyi Sonlandır */}
          <button onClick={onLeave}
            className="w-14 h-14 rounded-full bg-red-500 text-white hover:bg-red-600 flex items-center justify-center transition-all duration-200 shadow-lg">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M3 12h12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ===== OYUN MENÜSÜ ===== */}
      {showGameMenu && !activeGame && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowGameMenu(false)}>
          <div className="card-glass max-w-sm w-full mx-4 animate-fade-in max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-dark-800/90 backdrop-blur-xl z-10 pb-2">
              <h2 className="text-xl font-semibold text-white">🎮 Oyun Seç</h2>
              <button onClick={() => setShowGameMenu(false)}
                className="w-8 h-8 rounded-full glass text-gray-400 hover:text-white flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-2">
              {games.map(game => (
                <div key={game.id} className="w-full glass rounded-2xl p-3 flex items-center gap-3 text-left">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center text-lg text-white flex-shrink-0`}>{game.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm">{game.title}</h3>
                    <p className="text-xs text-gray-400 truncate">{game.desc}</p>
                  </div>
                  <button onClick={() => { launchGame(game.id); setShowGameMenu(false); }}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-green-400 to-emerald-500 text-dark-900 font-semibold text-xs hover:from-green-500 hover:to-emerald-600 active:scale-95 transition-all flex-shrink-0">
                    ▶ Başlat
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== AKTİF OYUNLAR ===== */}
      {activeGame === 'xox' && <XoxGame socket={socket} myId={myId} onClose={closeGame} />}
      {activeGame === 'rps' && <RpsGame socket={socket} myId={myId} onClose={closeGame} />}
      {activeGame === 'number' && <NumberGame socket={socket} myId={myId} onClose={closeGame} />}
      {activeGame === 'riddle' && <RiddleGame socket={socket} myId={myId} onClose={closeGame} />}
      {activeGame === 'uno' && <UnoGame socket={socket} myId={myId} onClose={closeGame} />}
      {activeGame === 'memory' && <MemoryGame socket={socket} myId={myId} onClose={closeGame} />}
      {activeGame === 'dice' && <DiceGame socket={socket} myId={myId} onClose={closeGame} />}
      {activeGame === 'word' && <WordGame socket={socket} myId={myId} onClose={closeGame} />}
      {activeGame === 'math' && <MathGame socket={socket} myId={myId} onClose={closeGame} />}
      {activeGame === 'reaction' && <ReactionGame socket={socket} myId={myId} onClose={closeGame} />}

      {/* ===== PAYLAŞIMLİ TARAYICI ===== */}
      {activePanel === 'browser' && (
        <SharedBrowser
          socket={socket}
          myId={myId}
          localStream={localStream}
          initialUrl={browserUrl}
          onClose={closeBrowser}
        />
      )}

      {/* ===== YOUTUBE EŞ ZAMANLI ===== */}
      {activePanel === 'youtube' && (
        <YoutubeSync
          socket={socket}
          myId={myId}
          localStream={localStream}
          onClose={closeYoutube}
        />
      )}
    </div>
  );
}
