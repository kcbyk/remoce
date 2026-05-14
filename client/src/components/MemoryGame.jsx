import React, { useState, useEffect, useCallback, useRef } from 'react';

export default function MemoryGame({ socket, myId, onClose }) {
  const [cards, setCards] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [myTurn, setMyTurn] = useState(false);
  const [scores, setScores] = useState({});
  const [winner, setWinner] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [gamePhase, setGamePhase] = useState('waiting');
  const [lastMatch, setLastMatch] = useState(null);
  const mountedRef = useRef(true);

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

    const onStarted = ({ cards: c, currentPlayer: cp }) => {
      if (!mountedRef.current) return;
      setCards(c); setCurrentPlayer(cp); setMyTurn(cp === myId);
      setWinner(null); setScores({}); setBlocked(false); setGamePhase('playing'); setLastMatch(null);
    };
    const onUpdate = ({ cards: c, currentPlayer: cp, match, scores: s, matchedIcon }) => {
      if (!mountedRef.current) return;
      setCards(c);
      if (s) setScores(s);
      if (match) {
        setLastMatch(matchedIcon || null);
        setCurrentPlayer(cp);
        setMyTurn(cp === myId);
      } else {
        setBlocked(true);
        setTimeout(() => {
          if (mountedRef.current) {
            setCurrentPlayer(cp);
            setMyTurn(cp === myId);
            setBlocked(false);
          }
        }, 1200);
      }
    };
    const onEnded = ({ winner: w, winnerUsername, scores: s }) => {
      if (!mountedRef.current) return;
      setWinner(w === myId ? 'win' : 'lose');
      if (s) setScores(s);
      setGamePhase('result');
    };
    const onClosed = () => {
      if (!mountedRef.current) return;
      setCards([]); setGamePhase('waiting');
    };

    socket.on('game-started-memory', onStarted);
    socket.on('game-update-memory', onUpdate);
    socket.on('game-ended-memory', onEnded);
    socket.on('game-closed-memory', onClosed);
    return () => {
      mountedRef.current = false;
      socket.off('game-started-memory', onStarted);
      socket.off('game-update-memory', onUpdate);
      socket.off('game-ended-memory', onEnded);
      socket.off('game-closed-memory', onClosed);
    };
  }, [socket, myId]);

  const flipCard = useCallback((id) => {
    if (!myTurn || blocked || winner || gamePhase !== 'playing') return;
    socket.emit('game-flip-memory', { cardId: id });
  }, [myTurn, blocked, winner, gamePhase, socket]);

  // Tekrar Oyna: start-game ile senkronize
  const handleRestart = useCallback(() => {
    socket.emit('start-game', { game: 'memory' });
  }, [socket]);

  const myScore = scores[myId] || 0;
  const oppScore = Object.entries(scores).find(([k]) => k !== myId)?.[1] || 0;
  const matchedCount = cards.filter(c => c.matched).length / 2;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" style={{ pointerEvents: dragging ? 'none' : 'auto' }}>
      <div className="card-glass max-w-sm w-full mx-4 animate-fade-in" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>

        {/* Header */}
        <div onMouseDown={(e) => hDS(e.clientX, e.clientY)} onTouchStart={(e) => hDS(e.touches[0].clientX, e.touches[0].clientY)}
          className="flex items-center justify-between mb-3 cursor-grab active:cursor-grabbing select-none px-3 py-2 -mx-3 -mt-3 rounded-t-3xl hover:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-lg text-white">🧠</div>
            <div>
              <h2 className="text-lg font-semibold text-white">Hafıza</h2>
              <p className="text-xs text-gray-400">
                {gamePhase === 'waiting' ? 'Başlatılıyor...'
                  : gamePhase === 'result' ? (winner === 'win' ? '🎉 Sen kazandın!' : '😔 Kaybettin!')
                  : blocked ? '⏳ Kartlar kapatılıyor...'
                  : myTurn ? '🎯 Kart seç!' : '⏳ Rakip seçiyor...'}
              </p>
            </div>
          </div>
          <button onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
            onClick={() => { socket.emit('game-reset-memory'); onClose(); }}
            className="w-8 h-8 rounded-full glass text-gray-400 hover:text-white flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {gamePhase === 'waiting' && (
          <div className="flex items-center justify-center py-10">
            <svg className="w-8 h-8 text-teal-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        )}

        {gamePhase === 'playing' && (
          <>
            {/* Skor */}
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="text-center">
                <div className="text-lg font-bold text-green-400">{myScore}</div>
                <div className="text-xs text-gray-500">Sen</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400">{matchedCount}/8 eşleşti</div>
                <div className={`text-xs font-medium mt-0.5 ${myTurn ? 'text-green-400' : 'text-blue-400'}`}>
                  {myTurn ? '🎯 Senin sıran' : '⏳ Rakip'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-400">{oppScore}</div>
                <div className="text-xs text-gray-500">Rakip</div>
              </div>
            </div>

            {lastMatch && (
              <div className="text-center text-xs text-green-400 mb-1 animate-pulse">
                ✅ Eşleşti: {lastMatch}
              </div>
            )}

            {/* Kartlar (4x4 grid) */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {cards.map(card => (
                <button key={card.id} onClick={() => flipCard(card.id)}
                  disabled={card.flipped || card.matched || !myTurn || blocked || !!winner}
                  className={`aspect-square rounded-lg text-xl flex items-center justify-center transition-all duration-300
                    ${card.matched
                      ? 'bg-green-500/20 border border-green-400/50'
                      : card.flipped
                        ? 'bg-glass border border-white/20'
                        : 'bg-gradient-to-br from-indigo-500/40 to-purple-500/40 border border-indigo-400/30 hover:from-indigo-500/60 hover:to-purple-500/60 active:scale-90 cursor-pointer'}
                    ${!myTurn || blocked ? 'cursor-not-allowed' : ''}`}>
                  {(card.flipped || card.matched)
                    ? <span className="animate-fade-in">{card.icon}</span>
                    : <span className="text-indigo-300/60 text-sm">?</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {gamePhase === 'result' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">{winner === 'win' ? '🎉' : '😔'}</div>
            <div className={`text-xl font-bold mb-3 ${winner === 'win' ? 'text-green-400' : 'text-red-400'}`}>
              {winner === 'win' ? 'Tebrikler, kazandın!' : 'Kaybettin!'}
            </div>
            <div className="glass rounded-xl px-4 py-3 mb-4 flex justify-center gap-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{myScore}</div>
                <div className="text-xs text-gray-400">Sen</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{oppScore}</div>
                <div className="text-xs text-gray-400">Rakip</div>
              </div>
            </div>
            <button onClick={handleRestart}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold text-sm hover:from-teal-600 hover:to-cyan-600 active:scale-95 transition-all">
              🔄 Tekrar Oyna
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
