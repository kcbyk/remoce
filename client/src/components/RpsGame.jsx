import React, { useState, useEffect, useCallback, useRef } from 'react';

const MOVES = [
  { id: 'rock', icon: '🪨', label: 'Taş', beats: 'scissors' },
  { id: 'paper', icon: '📄', label: 'Kağıt', beats: 'rock' },
  { id: 'scissors', icon: '✂️', label: 'Makas', beats: 'paper' },
];

export default function RpsGame({ socket, myId, onClose }) {
  const [phase, setPhase] = useState('select');
  const [myMove, setMyMove] = useState(null);
  const [opponentMove, setOpponentMove] = useState(null);
  const [result, setResult] = useState(null);
  const [score, setScore] = useState({ me: 0, opp: 0 });
  const [roundCount, setRoundCount] = useState(0);
  const mountedRef = useRef(true);

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

    const onStarted = () => {
      if (!mountedRef.current) return;
      setPhase('select'); setResult(null); setMyMove(null); setOpponentMove(null);
    };
    const onResult = ({ moves, winner, isDraw, winnerUsername }) => {
      if (!mountedRef.current) return;
      const oppId = Object.keys(moves).find(id => id !== myId);
      setMyMove(moves[myId]);
      setOpponentMove(moves[oppId]);
      setPhase('result');
      if (isDraw) {
        setResult('draw');
      } else if (winner === myId) {
        setResult('win');
        setScore(s => ({ ...s, me: s.me + 1 }));
      } else {
        setResult('lose');
        setScore(s => ({ ...s, opp: s.opp + 1 }));
      }
      setRoundCount(r => r + 1);
    };
    const onClosed = () => {
      if (!mountedRef.current) return;
      setPhase('select'); setResult(null); setScore({ me: 0, opp: 0 }); setRoundCount(0);
    };

    socket.on('game-started-rps', onStarted);
    socket.on('game-result-rps', onResult);
    socket.on('game-closed-rps', onClosed);
    return () => {
      mountedRef.current = false;
      socket.off('game-started-rps', onStarted);
      socket.off('game-result-rps', onResult);
      socket.off('game-closed-rps', onClosed);
    };
  }, [socket, myId]);

  const selectMove = useCallback((move) => {
    setMyMove(move); setPhase('wait');
    socket.emit('game-move-rps', { move });
  }, [socket]);

  // Tekrar Oyna: start-game ile senkronize
  const handleRestart = useCallback(() => {
    socket.emit('start-game', { game: 'rps' });
  }, [socket]);

  const getMoveIcon = (moveId) => MOVES.find(m => m.id === moveId)?.icon || '?';
  const getMoveLabel = (moveId) => MOVES.find(m => m.id === moveId)?.label || '?';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" style={{ pointerEvents: dragging ? 'none' : 'auto' }}>
      <div className="card-glass max-w-sm w-full mx-4 animate-fade-in"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, cursor: dragging ? 'grabbing' : 'auto' }}>

        <div onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
          className="flex items-center justify-between mb-4 cursor-grab active:cursor-grabbing select-none px-3 py-2 -mx-3 -mt-3 rounded-t-3xl hover:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-lg text-white">🪨</div>
            <div>
              <h2 className="text-lg font-semibold text-white">Taş-Kağıt-Makas</h2>
              <p className="text-xs text-gray-400">
                {phase === 'select' ? 'Hamleni seç!' : phase === 'wait' ? `${getMoveIcon(myMove)} Rakip bekleniyor...` : result === 'win' ? '🎉 Kazandın!' : result === 'lose' ? '😔 Kaybettin!' : '🤝 Berabere!'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {roundCount > 0 && (
              <div className="text-xs text-gray-400 text-right">
                <span className="text-green-400 font-bold">{score.me}</span>
                <span className="mx-1">-</span>
                <span className="text-red-400 font-bold">{score.opp}</span>
              </div>
            )}
            <button onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
              onClick={() => { socket.emit('game-reset-rps'); onClose(); }}
              className="w-8 h-8 rounded-full glass text-gray-400 hover:text-white flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {phase === 'select' && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            {MOVES.map(m => (
              <button key={m.id} onClick={() => selectMove(m.id)}
                className="aspect-square rounded-2xl bg-glass hover:bg-glass-light border border-glass-border hover:border-white/30 active:scale-90 transition-all duration-200 flex flex-col items-center justify-center gap-2">
                <span className="text-4xl">{m.icon}</span>
                <span className="text-xs text-gray-400">{m.label}</span>
              </button>
            ))}
          </div>
        )}

        {phase === 'wait' && (
          <div className="flex flex-col items-center justify-center py-10 mb-4 gap-3">
            <div className="text-6xl animate-bounce">{getMoveIcon(myMove)}</div>
            <p className="text-sm text-gray-400 font-medium">{getMoveLabel(myMove)} seçildi!</p>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Rakibin hamlesi bekleniyor...
            </div>
          </div>
        )}

        {phase === 'result' && (
          <div className="text-center mb-4 animate-slide-up">
            <div className="flex items-center justify-center gap-8 mb-4">
              <div className="text-center">
                <div className="text-5xl mb-1">{getMoveIcon(myMove)}</div>
                <div className="text-xs text-gray-400">Sen</div>
                <div className="text-xs font-medium text-white mt-1">{getMoveLabel(myMove)}</div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="text-2xl text-gray-500">vs</div>
                <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${result === 'win' ? 'bg-green-500/20 text-green-400' : result === 'lose' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                  {result === 'win' ? 'Kazandın' : result === 'lose' ? 'Kaybettin' : 'Berabere'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-5xl mb-1">{getMoveIcon(opponentMove)}</div>
                <div className="text-xs text-gray-400">Rakip</div>
                <div className="text-xs font-medium text-white mt-1">{getMoveLabel(opponentMove)}</div>
              </div>
            </div>
            <div className={`text-xl font-bold mb-4 ${result === 'win' ? 'text-green-400' : result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
              {result === 'win' ? '🎉 Sen kazandın!' : result === 'lose' ? '😔 Kaybettin!' : '🤝 Berabere!'}
            </div>
            <div className="glass rounded-xl px-4 py-2 mb-4 flex items-center justify-center gap-6">
              <div className="text-center">
                <div className="text-xl font-bold text-green-400">{score.me}</div>
                <div className="text-xs text-gray-400">Sen</div>
              </div>
              <div className="text-gray-500">:</div>
              <div className="text-center">
                <div className="text-xl font-bold text-red-400">{score.opp}</div>
                <div className="text-xs text-gray-400">Rakip</div>
              </div>
            </div>
            <button onClick={handleRestart}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-semibold text-sm hover:from-yellow-600 hover:to-orange-600 active:scale-95 transition-all">
              🔄 Tekrar Oyna
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
