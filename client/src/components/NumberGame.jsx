import React, { useState, useEffect, useCallback, useRef } from 'react';

export default function NumberGame({ socket, myId, onClose }) {
  const [phase, setPhase] = useState('waiting');
  const [myTurn, setMyTurn] = useState(false);
  const [guess, setGuess] = useState('');
  const [hints, setHints] = useState([]);
  const [result, setResult] = useState(null);
  const [target, setTarget] = useState(null);
  const [guessCount, setGuessCount] = useState(0);
  const mountedRef = useRef(true);
  const hintsEndRef = useRef(null);

  // Draggable
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, elX: 0, elY: 0 });

  const handleDragStart = useCallback((cx, cy) => {
    setDragging(true);
    dragRef.current = { startX: cx, startY: cy, elX: pos.x, elY: pos.y };
  }, [pos]);

  const handleDragMove = useCallback((cx, cy) => {
    if (!dragging) return;
    setPos({ x: dragRef.current.elX + cx - dragRef.current.startX, y: dragRef.current.elY + cy - dragRef.current.startY });
  }, [dragging]);

  const handleDragEnd = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!dragging) return;
    const mm = (e) => handleDragMove(e.clientX, e.clientY);
    const tm = (e) => handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    const up = () => handleDragEnd();
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', tm, { passive: false }); window.addEventListener('touchend', up);
    return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', up); window.removeEventListener('touchmove', tm); window.removeEventListener('touchend', up); };
  }, [dragging, handleDragMove, handleDragEnd]);

  useEffect(() => {
    if (!socket) return;
    mountedRef.current = true;

    const onStarted = ({ yourTurn }) => {
      if (!mountedRef.current) return;
      setPhase('playing'); setMyTurn(yourTurn); setHints([]); setResult(null); setTarget(null); setGuessCount(0);
    };
    const onHint = ({ hint, guess: g, userId, nextGuesser }) => {
      if (!mountedRef.current) return;
      setHints(prev => [...prev, { userId, guess: g, hint }]);
      setMyTurn(nextGuesser === myId);
      setGuessCount(c => c + 1);
    };
    const onCorrect = ({ winner, winnerUsername, target: t, totalGuesses }) => {
      if (!mountedRef.current) return;
      setTarget(t); setPhase('result');
      setResult(winner === myId ? 'win' : 'lose');
    };
    const onClosed = () => {
      if (!mountedRef.current) return;
      setPhase('waiting'); setHints([]); setResult(null); setTarget(null);
    };

    socket.on('game-started-number', onStarted);
    socket.on('game-number-hint', onHint);
    socket.on('game-number-correct', onCorrect);
    socket.on('game-closed-number', onClosed);
    return () => {
      mountedRef.current = false;
      socket.off('game-started-number', onStarted);
      socket.off('game-number-hint', onHint);
      socket.off('game-number-correct', onCorrect);
      socket.off('game-closed-number', onClosed);
    };
  }, [socket, myId]);

  // Otomatik kaydır
  useEffect(() => {
    hintsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [hints]);

  const submitGuess = useCallback(() => {
    const num = parseInt(guess);
    if (isNaN(num) || num < 1 || num > 100) return;
    socket.emit('game-guess-number', { guess: num });
    setGuess('');
  }, [guess, socket]);

  // Tekrar Oyna: start-game ile senkronize
  const handleRestart = useCallback(() => {
    socket.emit('start-game', { game: 'number' });
  }, [socket]);

  const getHintColor = (hint) => {
    if (hint.includes('büyük')) return 'text-red-400';
    if (hint.includes('küçük')) return 'text-blue-400';
    return 'text-green-400';
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" style={{ pointerEvents: dragging ? 'none' : 'auto' }}>
      <div className="card-glass max-w-sm w-full mx-4 animate-fade-in"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, cursor: dragging ? 'grabbing' : 'auto' }}>

        <div onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
          className="flex items-center justify-between mb-4 cursor-grab active:cursor-grabbing select-none px-3 py-2 -mx-3 -mt-3 rounded-t-3xl hover:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-lg text-white">🔢</div>
            <div>
              <h2 className="text-lg font-semibold text-white">Sayı Tahmin</h2>
              <p className="text-xs text-gray-400">
                {phase === 'waiting' ? 'Başlatılıyor...'
                  : phase === 'playing' ? (myTurn ? '🎯 Senin sıran!' : '⏳ Rakibin sırası...')
                  : result === 'win' ? '🎉 Sen kazandın!' : '😔 Kaybettin!'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {guessCount > 0 && phase === 'playing' && (
              <span className="text-xs text-gray-500">{guessCount} tahmin</span>
            )}
            <button onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
              onClick={() => { socket.emit('game-reset-number'); onClose(); }}
              className="w-8 h-8 rounded-full glass text-gray-400 hover:text-white flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {phase === 'waiting' && (
          <div className="flex items-center justify-center py-12">
            <svg className="w-8 h-8 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        )}

        {phase === 'playing' && (
          <>
            <div className="text-center mb-3">
              <span className="text-xs text-gray-400">1 ile 100 arasında bir sayı tahmin et</span>
              <div className={`mt-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium ${myTurn ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'}`}>
                <span className={`w-2 h-2 rounded-full ${myTurn ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
                {myTurn ? 'Senin sıran!' : 'Rakip düşünüyor...'}
              </div>
            </div>

            {myTurn && (
              <div className="flex gap-2 mb-3">
                <input type="number" min="1" max="100" value={guess} onChange={(e) => setGuess(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitGuess()}
                  className="flex-1 px-4 py-3 rounded-2xl bg-glass backdrop-blur-xl border border-glass-border text-white placeholder-gray-500 focus:border-white/40 focus:outline-none text-lg text-center"
                  placeholder="1-100" autoFocus />
                <button onClick={submitGuess} disabled={!guess}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold disabled:opacity-50 hover:from-blue-600 hover:to-cyan-600 active:scale-95 transition-all">
                  Tahmin
                </button>
              </div>
            )}

            {hints.length > 0 && (
              <div className="space-y-1.5 mb-3 max-h-36 overflow-y-auto pr-1">
                {hints.map((h, i) => (
                  <div key={i} className={`glass rounded-xl px-3 py-2 text-sm flex items-center gap-2 ${h.userId === myId ? 'border-l-2 border-blue-400' : 'border-l-2 border-purple-400'}`}>
                    <span className="text-gray-400 text-xs">{h.userId === myId ? 'Sen' : 'Rakip'}:</span>
                    <span className="font-mono font-bold text-white">{h.guess}</span>
                    <span className={`ml-auto text-xs font-medium ${getHintColor(h.hint)}`}>{h.hint}</span>
                  </div>
                ))}
                <div ref={hintsEndRef} />
              </div>
            )}
          </>
        )}

        {phase === 'result' && (
          <div className="text-center mb-4 animate-slide-up">
            <div className="text-5xl mb-3">{result === 'win' ? '🎉' : '😔'}</div>
            <div className={`text-2xl font-bold mb-2 ${result === 'win' ? 'text-green-400' : 'text-red-400'}`}>
              {result === 'win' ? 'Tebrikler, kazandın!' : 'Kaybettin!'}
            </div>
            <div className="glass rounded-xl px-4 py-3 mb-4">
              <p className="text-gray-400 text-sm">Doğru sayı</p>
              <p className="text-white font-bold text-3xl">{target}</p>
              <p className="text-gray-500 text-xs mt-1">{guessCount} tahmin yapıldı</p>
            </div>
            <button onClick={handleRestart}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-sm hover:from-blue-600 hover:to-cyan-600 active:scale-95 transition-all">
              🔄 Tekrar Oyna
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
