import React, { useCallback, useEffect, useRef, useState } from 'react';

export default function ReactionGame({ socket, myId, onClose }) {
  const [phase, setPhase] = useState('waiting');
  const [scores, setScores] = useState({});
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [canClick, setCanClick] = useState(false);
  const [result, setResult] = useState(null);
  const mountedRef = useRef(true);

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

    const onStarted = ({ round: r, totalRounds: tr, scores: sc }) => {
      if (!mountedRef.current) return;
      setRound(r || 1);
      setTotalRounds(tr || 5);
      setScores(sc || {});
      setPhase('wait');
      setFeedback('Hazır ol... GO yazınca tıkla!');
      setCanClick(false);
      setResult(null);
    };
    const onNext = onStarted;
    const onGo = () => {
      if (!mountedRef.current) return;
      setPhase('go');
      setFeedback('GO!');
      setCanClick(true);
    };
    const onRoundResult = ({ winner, winnerUsername, foulBy, foulUsername, isDraw, reactionMs, scores: sc }) => {
      if (!mountedRef.current) return;
      setScores(sc || {});
      setCanClick(false);
      setPhase('roundResult');
      if (isDraw) setFeedback('Kimse tıklamadı 🤝');
      else if (foulBy) setFeedback(`${foulUsername || 'Birisi'} erken bastı! Kazanan: ${winnerUsername || 'Rakip'}`);
      else setFeedback(`Kazanan: ${winnerUsername || (winner === myId ? 'Sen' : 'Rakip')}${reactionMs !== null ? ` (${reactionMs}ms)` : ''}`);
      setTimeout(() => { if (mountedRef.current) setFeedback(''); }, 1100);
    };
    const onEnded = ({ winner, scores: sc }) => {
      if (!mountedRef.current) return;
      setScores(sc || {});
      if (!winner) setResult('draw');
      else if (winner === myId) setResult('win');
      else setResult('lose');
      setPhase('result');
      setCanClick(false);
      setFeedback('');
    };
    const onClosed = () => {
      if (!mountedRef.current) return;
      setPhase('waiting');
      setScores({});
      setRound(1);
      setTotalRounds(5);
      setFeedback('');
      setCanClick(false);
      setResult(null);
    };

    socket.on('game-started-reaction', onStarted);
    socket.on('game-next-reaction', onNext);
    socket.on('game-reaction-go', onGo);
    socket.on('game-reaction-result', onRoundResult);
    socket.on('game-ended-reaction', onEnded);
    socket.on('game-closed-reaction', onClosed);
    return () => {
      mountedRef.current = false;
      socket.off('game-started-reaction', onStarted);
      socket.off('game-next-reaction', onNext);
      socket.off('game-reaction-go', onGo);
      socket.off('game-reaction-result', onRoundResult);
      socket.off('game-ended-reaction', onEnded);
      socket.off('game-closed-reaction', onClosed);
    };
  }, [socket, myId]);

  const click = useCallback(() => {
    if (!canClick) return;
    setCanClick(false);
    socket.emit('game-click-reaction');
  }, [canClick, socket]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" style={{ pointerEvents: dragging ? 'none' : 'auto' }}>
      <div className="card-glass max-w-sm w-full mx-4 animate-fade-in" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        <div onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)} onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
          className="flex items-center justify-between mb-4 cursor-grab active:cursor-grabbing select-none px-3 py-2 -mx-3 -mt-3 rounded-t-3xl hover:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-lg text-white">⚡</div>
            <div>
              <h2 className="text-lg font-semibold text-white">Refleks Düellosu</h2>
              <p className="text-xs text-gray-400">
                {phase === 'waiting' ? 'Başlatılıyor...' : phase === 'result' ? (result === 'win' ? 'Sen kazandın! 🎉' : result === 'lose' ? 'Kaybettin! 😔' : 'Berabere! 🤝') : `Tur ${round}/${totalRounds}`}
              </p>
            </div>
          </div>
          <button onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
            onClick={() => { socket.emit('game-reset-reaction'); onClose(); }} className="w-8 h-8 rounded-full glass text-gray-400 hover:text-white flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {phase === 'waiting' && (
          <div className="flex items-center justify-center py-10">
            <svg className="w-8 h-8 text-orange-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        )}

        {(phase === 'wait' || phase === 'go' || phase === 'roundResult') && (
          <>
            <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
              <span>Skor: <span className="text-white font-semibold">{scores[myId] || 0}</span></span>
              <span>{phase === 'go' ? 'Şimdi!' : 'Hazır ol'}</span>
            </div>
            <button onClick={click}
              disabled={!canClick}
              className={`w-full py-6 rounded-3xl font-extrabold text-3xl tracking-wide transition-all active:scale-[0.99]
                ${canClick ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white' : 'bg-glass border border-glass-border text-gray-400'}`}>
              {canClick ? 'GO' : '...'}
            </button>
            {feedback && <div className="text-xs text-gray-300 text-center mt-3">{feedback}</div>}
          </>
        )}

        {phase === 'result' && (
          <div className="text-center py-6 animate-slide-up">
            <div className="text-5xl mb-3">{result === 'win' ? '🎉' : result === 'lose' ? '😔' : '🤝'}</div>
            <div className={`text-2xl font-bold mb-2 ${result === 'win' ? 'text-green-400' : result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
              {result === 'win' ? 'Tebrikler, kazandın!' : result === 'lose' ? 'Kaybettin!' : 'Berabere!'}
            </div>
            <p className="text-gray-400 mb-2">Skorun: <span className="text-white font-bold">{scores[myId] || 0}</span></p>
            <button onClick={() => socket.emit('start-game', { game: 'reaction' })}
              className="w-full py-3 mt-4 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold hover:from-orange-600 hover:to-red-600 active:scale-95 transition-all">
              🔄 Tekrar Oyna
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

