import React, { useState, useEffect, useCallback, useRef } from 'react';

export default function WordGame({ socket, myId, onClose }) {
  const [phase, setPhase] = useState('waiting');
  const [scrambled, setScrambled] = useState('');
  const [guess, setGuess] = useState('');
  const [myTurn, setMyTurn] = useState(false);
  const [scores, setScores] = useState({ me: 0, opp: 0 });
  const [round, setRound] = useState(1);
  const [feedback, setFeedback] = useState(null); // { text, type }
  const [winner, setWinner] = useState(null);
  const [solvedBy, setSolvedBy] = useState(null);
  const [wrongGuess, setWrongGuess] = useState(false);
  const mountedRef = useRef(true);
  const inputRef = useRef(null);

  // Draggable
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, elX: 0, elY: 0 });

  const hDS = useCallback((cx, cy) => { setDragging(true); dragRef.current = { startX: cx, startY: cy, elX: pos.x, elY: pos.y }; }, [pos]);
  const hDM = useCallback((cx, cy) => { if (!dragging) return; setPos({ x: dragRef.current.elX + cx - dragRef.current.startX, y: dragRef.current.elY + cy - dragRef.current.startY }); }, [dragging]);
  const hDE = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!dragging) return;
    const mm = (e) => hDM(e.clientX, e.clientY);
    const tm = (e) => hDM(e.touches[0].clientX, e.touches[0].clientY);
    const up = () => hDE();
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', tm, { passive: false }); window.addEventListener('touchend', up);
    return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', up); window.removeEventListener('touchmove', tm); window.removeEventListener('touchend', up); };
  }, [dragging, hDM, hDE]);

  useEffect(() => {
    if (!socket) return;
    mountedRef.current = true;

    const onStarted = ({ scrambled: s, currentPlayer: cp, round: r }) => {
      if (!mountedRef.current) return;
      setScrambled(s); setMyTurn(cp === myId); setRound(r);
      setPhase('playing'); setFeedback(null); setWinner(null);
      setGuess(''); setSolvedBy(null); setWrongGuess(false);
      setScores({ me: 0, opp: 0 });
    };
    const onCorrect = ({ userId, username, word, scores: sc }) => {
      if (!mountedRef.current) return;
      const myScore = sc[myId] || 0;
      const oppScore = Object.entries(sc).find(([k]) => k !== myId)?.[1] || 0;
      setScores({ me: myScore, opp: oppScore });
      setSolvedBy(userId === myId ? 'me' : 'opp');
      setFeedback({ text: userId === myId ? `✅ Doğru! "${word}"` : `🎯 ${username} bildi: "${word}"`, type: userId === myId ? 'win' : 'lose' });
      setGuess('');
    };
    const onNext = ({ scrambled: s, currentPlayer: cp, round: r, scores: sc }) => {
      if (!mountedRef.current) return;
      setScrambled(s); setMyTurn(cp === myId); setRound(r);
      const myScore = sc[myId] || 0;
      const oppScore = Object.entries(sc).find(([k]) => k !== myId)?.[1] || 0;
      setScores({ me: myScore, opp: oppScore });
      setGuess(''); setFeedback(null); setSolvedBy(null); setWrongGuess(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    const onEnded = ({ winner: w, winnerUsername, scores: sc }) => {
      if (!mountedRef.current) return;
      setWinner(w === myId ? 'win' : 'lose');
      const myScore = sc[myId] || 0;
      const oppScore = Object.entries(sc).find(([k]) => k !== myId)?.[1] || 0;
      setScores({ me: myScore, opp: oppScore });
      setPhase('result');
    };
    const onClosed = () => {
      if (!mountedRef.current) return;
      setPhase('waiting');
    };

    socket.on('game-started-word', onStarted);
    socket.on('game-word-correct', onCorrect);
    socket.on('game-next-word', onNext);
    socket.on('game-ended-word', onEnded);
    socket.on('game-closed-word', onClosed);
    return () => {
      mountedRef.current = false;
      socket.off('game-started-word', onStarted);
      socket.off('game-word-correct', onCorrect);
      socket.off('game-next-word', onNext);
      socket.off('game-ended-word', onEnded);
      socket.off('game-closed-word', onClosed);
    };
  }, [socket, myId]);

  const submitGuess = useCallback(() => {
    if (!guess.trim() || !myTurn || !!winner) return;
    socket.emit('game-guess-word', { guess: guess.trim() });
    setGuess('');
  }, [guess, myTurn, winner, socket]);

  // Yanlış tahmin animasyonu
  const handleWrongKey = () => {
    setWrongGuess(true);
    setTimeout(() => setWrongGuess(false), 500);
  };

  // Tekrar Oyna: start-game ile senkronize
  const handleRestart = useCallback(() => {
    socket.emit('start-game', { game: 'word' });
  }, [socket]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" style={{ pointerEvents: dragging ? 'none' : 'auto' }}>
      <div className="card-glass max-w-sm w-full mx-4 animate-fade-in" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>

        {/* Header */}
        <div onMouseDown={(e) => hDS(e.clientX, e.clientY)} onTouchStart={(e) => hDS(e.touches[0].clientX, e.touches[0].clientY)}
          className="flex items-center justify-between mb-3 cursor-grab active:cursor-grabbing select-none px-3 py-2 -mx-3 -mt-3 rounded-t-3xl hover:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-lg text-white">📝</div>
            <div>
              <h2 className="text-lg font-semibold text-white">Kelime Bulmaca</h2>
              <p className="text-xs text-gray-400">
                {phase === 'waiting' ? 'Başlatılıyor...'
                  : phase === 'result' ? (winner === 'win' ? '🎉 Sen kazandın!' : '😔 Kaybettin!')
                  : solvedBy ? (solvedBy === 'me' ? '✅ Sen bildin!' : '🎯 Rakip bildi!')
                  : myTurn ? '🎯 Tahmin et!' : '⏳ Rakip tahmin ediyor...'}
              </p>
            </div>
          </div>
          <button onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
            onClick={() => { socket.emit('game-reset-word'); onClose(); }}
            className="w-8 h-8 rounded-full glass text-gray-400 hover:text-white flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {phase === 'waiting' && (
          <div className="flex items-center justify-center py-10">
            <svg className="w-8 h-8 text-pink-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        )}

        {phase === 'playing' && (
          <>
            {/* Skor & Tur */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="glass rounded-xl px-3 py-1.5 text-center">
                <div className="text-lg font-bold text-green-400">{scores.me}</div>
                <div className="text-xs text-gray-400">Sen</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400">Tur</div>
                <div className="text-sm font-bold text-white">{round}/8</div>
              </div>
              <div className="glass rounded-xl px-3 py-1.5 text-center">
                <div className="text-lg font-bold text-blue-400">{scores.opp}</div>
                <div className="text-xs text-gray-400">Rakip</div>
              </div>
            </div>

            {/* Karışık kelime */}
            <div className="glass rounded-2xl px-4 py-5 mb-3 text-center">
              <p className="text-xs text-gray-400 mb-2">Bu harfleri sırala:</p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {scrambled.split('').map((l, i) => (
                  <span key={i} className="inline-flex w-8 h-10 items-center justify-center bg-glass rounded-lg border border-glass-border text-white font-bold text-lg">
                    {l}
                  </span>
                ))}
              </div>
            </div>

            {/* Feedback */}
            {feedback && (
              <div className={`text-sm text-center mb-2 font-medium animate-fade-in ${feedback.type === 'win' ? 'text-green-400' : 'text-blue-400'}`}>
                {feedback.text}
              </div>
            )}

            {/* Tahmin girişi - her ikisi de tahmin edebilir */}
            <div className="flex gap-2 mb-3">
              <input ref={inputRef} type="text" value={guess}
                onChange={(e) => setGuess(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitGuess();
                }}
                disabled={!myTurn || !!winner || !!solvedBy}
                className={`flex-1 px-3 py-2.5 rounded-xl bg-glass backdrop-blur-xl border text-white placeholder-gray-500 focus:outline-none text-sm text-center uppercase transition-all
                  ${wrongGuess ? 'border-red-500 animate-pulse' : myTurn ? 'border-white/30 focus:border-white/50' : 'border-glass-border opacity-60'}`}
                placeholder={myTurn ? 'Kelimeyi yaz...' : 'Rakip tahmin ediyor...'}
                autoFocus={myTurn} />
              <button onClick={submitGuess}
                disabled={!guess.trim() || !myTurn || !!winner || !!solvedBy}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold text-sm disabled:opacity-40 hover:from-pink-600 hover:to-rose-600 active:scale-95 transition-all">
                ✓
              </button>
            </div>

            {!myTurn && !solvedBy && (
              <p className="text-xs text-center text-gray-500 mb-1">Sadece sen tahmin edebilirsin</p>
            )}
          </>
        )}

        {phase === 'result' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">{winner === 'win' ? '🎉' : '😔'}</div>
            <div className={`text-xl font-bold mb-3 ${winner === 'win' ? 'text-green-400' : 'text-red-400'}`}>
              {winner === 'win' ? 'Tebrikler, kazandın!' : 'Kaybettin!'}
            </div>
            <div className="glass rounded-xl px-4 py-3 mb-4 flex justify-center gap-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{scores.me}</div>
                <div className="text-xs text-gray-400">Sen</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{scores.opp}</div>
                <div className="text-xs text-gray-400">Rakip</div>
              </div>
            </div>
            <button onClick={handleRestart}
              className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold text-sm hover:from-pink-600 hover:to-rose-600 active:scale-95 transition-all">
              🔄 Tekrar Oyna
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
