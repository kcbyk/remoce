import React, { useState, useEffect, useCallback, useRef } from 'react';

const COLOR_CLASSES = {
  red: 'bg-red-500 border-red-400',
  blue: 'bg-blue-500 border-blue-400',
  green: 'bg-green-500 border-green-400',
  yellow: 'bg-yellow-500 border-yellow-400',
  wild: 'bg-gradient-to-br from-red-500 via-yellow-500 to-green-500 border-white/30',
};

const COLOR_BG = {
  red: 'bg-red-500/20 border-red-500/40',
  blue: 'bg-blue-500/20 border-blue-500/40',
  green: 'bg-green-500/20 border-green-500/40',
  yellow: 'bg-yellow-500/20 border-yellow-500/40',
};

export default function UnoGame({ socket, myId, onClose }) {
  const [hand, setHand] = useState([]);
  const [topCard, setTopCard] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [myTurn, setMyTurn] = useState(false);
  const [winner, setWinner] = useState(null);
  const [lastPlay, setLastPlay] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pendingWildId, setPendingWildId] = useState(null);
  const [opponentCardCount, setOpponentCardCount] = useState(7);
  const [gamePhase, setGamePhase] = useState('waiting');
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

    const onStarted = ({ hand: h, topCard: tc, currentPlayer: cp }) => {
      if (!mountedRef.current) return;
      setHand(h); setTopCard(tc); setCurrentPlayer(cp); setMyTurn(cp === myId);
      setWinner(null); setLastPlay(null); setShowColorPicker(false); setGamePhase('playing');
      setOpponentCardCount(7);
    };
    const onUpdate = ({ hand: h, topCard: tc, currentPlayer: cp, lastPlay: lp, opponentCards }) => {
      if (!mountedRef.current) return;
      if (h !== undefined) setHand(h);
      setTopCard(tc); setCurrentPlayer(cp); setMyTurn(cp === myId);
      if (lp) setLastPlay(lp);
      if (opponentCards !== undefined) setOpponentCardCount(opponentCards);
    };
    const onEnded = ({ winner: w, winnerUsername, isDraw }) => {
      if (!mountedRef.current) return;
      if (isDraw) {
        setWinner('draw');
      } else {
        setWinner(w === myId ? 'win' : 'lose');
      }
      setGamePhase('result');
    };
    const onClosed = () => {
      if (!mountedRef.current) return;
      setHand([]); setTopCard(null); setWinner(null); setGamePhase('waiting');
    };

    socket.on('game-started-uno', onStarted);
    socket.on('game-update-uno', onUpdate);
    socket.on('game-ended-uno', onEnded);
    socket.on('game-closed-uno', onClosed);
    return () => {
      mountedRef.current = false;
      socket.off('game-started-uno', onStarted);
      socket.off('game-update-uno', onUpdate);
      socket.off('game-ended-uno', onEnded);
      socket.off('game-closed-uno', onClosed);
    };
  }, [socket, myId]);

  const playCard = useCallback((card) => {
    if (!myTurn || winner) return;
    if (card.color === 'wild') {
      setShowColorPicker(true);
      setPendingWildId(card.id);
      return;
    }
    socket.emit('game-play-uno', { cardId: card.id });
  }, [myTurn, winner, socket]);

  const chooseColor = useCallback((color) => {
    setShowColorPicker(false);
    socket.emit('game-play-uno', { cardId: pendingWildId, chosenColor: color });
    setPendingWildId(null);
  }, [pendingWildId, socket]);

  const drawCard = useCallback(() => {
    if (myTurn && !winner && gamePhase === 'playing') socket.emit('game-draw-uno');
  }, [myTurn, winner, gamePhase, socket]);

  const canPlay = (card) => {
    if (!topCard || !myTurn || winner || gamePhase !== 'playing') return false;
    if (card.color === 'wild') return true;
    return card.color === topCard.color || card.value === topCard.value;
  };

  const cardLabel = (c) => {
    if (!c) return '';
    if (c.value === 'skip') return '🚫';
    if (c.value === 'reverse') return '🔄';
    if (c.value === '+2') return '+2';
    if (c.value === '+4') return '+4';
    if (c.value === 'wild') return '★';
    return c.value;
  };

  // Tekrar Oyna: start-game ile senkronize
  const handleRestart = useCallback(() => {
    socket.emit('start-game', { game: 'uno' });
  }, [socket]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" style={{ pointerEvents: dragging ? 'none' : 'auto' }}>
      <div className="card-glass max-w-sm w-full mx-4 animate-fade-in" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>

        {/* Header */}
        <div onMouseDown={(e) => hDS(e.clientX, e.clientY)} onTouchStart={(e) => hDS(e.touches[0].clientX, e.touches[0].clientY)}
          className="flex items-center justify-between mb-3 cursor-grab active:cursor-grabbing select-none px-3 py-2 -mx-3 -mt-3 rounded-t-3xl hover:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center text-lg text-white">🃏</div>
            <div>
              <h2 className="text-lg font-semibold text-white">UNO</h2>
              <p className="text-xs text-gray-400">
                {gamePhase === 'waiting' ? 'Başlatılıyor...'
                  : gamePhase === 'result'
                    ? (winner === 'win' ? '🎉 Kazandın!' : winner === 'lose' ? '😔 Kaybettin!' : '🤝 Berabere!')
                    : myTurn ? '🎯 Senin sıran!' : '⏳ Rakip oynuyor...'}
              </p>
            </div>
          </div>
          <button onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
            onClick={() => { socket.emit('game-reset-uno'); onClose(); }}
            className="w-8 h-8 rounded-full glass text-gray-400 hover:text-white flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {gamePhase === 'waiting' && (
          <div className="flex items-center justify-center py-10">
            <svg className="w-8 h-8 text-red-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        )}

        {gamePhase === 'playing' && (
          <>
            {/* Skor bilgisi */}
            <div className="flex items-center justify-between mb-3 text-xs text-gray-400">
              <span>Elde: <span className="text-white font-bold">{hand.length}</span> kart</span>
              <span>Rakip: <span className="text-white font-bold">{opponentCardCount}</span> kart</span>
            </div>

            {/* Son oynan kart bildirimi */}
            {lastPlay && (
              <div className="text-xs text-center text-gray-400 mb-2">
                {lastPlay.userId === myId ? 'Sen' : 'Rakip'} oynadı: <span className="text-white">{cardLabel(lastPlay.card)}</span>
              </div>
            )}

            {/* Üstteki kart */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Demet</div>
                <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 border border-white/10 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform active:scale-95"
                  onClick={drawCard}>
                  <span className="text-white text-lg">🃏</span>
                </div>
              </div>
              <div className="text-gray-500 text-xl">→</div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Açık kart</div>
                {topCard && (
                  <div className={`w-12 h-16 rounded-lg ${COLOR_CLASSES[topCard.color] || 'bg-gray-600'} border-2 flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                    {cardLabel(topCard)}
                  </div>
                )}
              </div>
            </div>

            {/* Renk seçici */}
            {showColorPicker && (
              <div className="glass rounded-2xl p-3 mb-3">
                <p className="text-xs text-center text-gray-400 mb-2">Renk seç:</p>
                <div className="flex gap-2 justify-center">
                  {['red', 'blue', 'green', 'yellow'].map(c => (
                    <button key={c} onClick={() => chooseColor(c)}
                      className={`w-10 h-10 rounded-full border-2 ${COLOR_CLASSES[c]} hover:scale-110 active:scale-95 transition-transform`} />
                  ))}
                </div>
              </div>
            )}

            {/* Elde */}
            <div className="flex flex-wrap gap-1.5 justify-center mb-3 max-h-28 overflow-y-auto py-1">
              {hand.map(card => {
                const playable = canPlay(card) && !showColorPicker;
                return (
                  <button key={card.id} onClick={() => playCard(card)} disabled={!playable}
                    className={`rounded-lg border-2 flex items-center justify-center text-sm font-bold text-white shadow transition-all duration-150
                      ${COLOR_CLASSES[card.color] || 'bg-gray-600 border-gray-500'}
                      ${playable ? 'hover:scale-110 hover:-translate-y-2 cursor-pointer ring-2 ring-white/40 shadow-lg' : 'opacity-50 cursor-not-allowed'}`}
                    style={{ width: '2.75rem', height: '3.75rem' }}>
                    {cardLabel(card)}
                  </button>
                );
              })}
            </div>

            {/* Kart çek */}
            {myTurn && !showColorPicker && (
              <button onClick={drawCard}
                className="w-full py-2 rounded-xl bg-glass hover:bg-glass-light border border-glass-border text-sm text-white transition-all active:scale-95">
                🃏 Kart Çek
              </button>
            )}
          </>
        )}

        {gamePhase === 'result' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">{winner === 'win' ? '🎉' : winner === 'lose' ? '😔' : '🤝'}</div>
            <div className={`text-xl font-bold mb-2 ${winner === 'win' ? 'text-green-400' : winner === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
              {winner === 'win' ? 'Tebrikler, kazandın!' : winner === 'lose' ? 'Kaybettin!' : 'Berabere!'}
            </div>
            <button onClick={handleRestart}
              className="w-full py-3 mt-3 rounded-2xl bg-gradient-to-r from-red-500 to-rose-500 text-white font-semibold text-sm hover:from-red-600 hover:to-rose-600 active:scale-95 transition-all">
              🔄 Tekrar Oyna
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
