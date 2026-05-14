import React, { useState, useEffect, useCallback, useRef } from 'react';

export default function XoxGame({ socket, myId, onClose }) {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [mySymbol, setMySymbol] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [winner, setWinner] = useState(null);
  const [isDraw, setIsDraw] = useState(false);
  const [winnerUsername, setWinnerUsername] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const mountedRef = useRef(true);

  // Draggable
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, elX: 0, elY: 0 });

  const handleDragStart = useCallback((clientX, clientY) => {
    setDragging(true);
    dragRef.current = { startX: clientX, startY: clientY, elX: pos.x, elY: pos.y };
  }, [pos]);

  const handleDragMove = useCallback((clientX, clientY) => {
    if (!dragging) return;
    setPos({ x: dragRef.current.elX + clientX - dragRef.current.startX, y: dragRef.current.elY + clientY - dragRef.current.startY });
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

    const onYourSymbol = ({ symbol, currentPlayer: cp }) => {
      if (!mountedRef.current) return;
      setMySymbol(symbol); setCurrentPlayer(cp); setGameStarted(true);
    };
    const onStarted = ({ board: b, currentPlayer: cp }) => {
      if (!mountedRef.current) return;
      setBoard(b); setCurrentPlayer(cp); setWinner(null); setIsDraw(false);
      setShowResult(false); setGameStarted(true); setWinnerUsername(null);
    };
    const onUpdate = ({ board: b, currentPlayer: cp }) => {
      if (!mountedRef.current) return;
      setBoard(b); setCurrentPlayer(cp);
    };
    const onEnded = ({ board: b, winner: w, winnerUsername: wu, isDraw: d }) => {
      if (!mountedRef.current) return;
      setBoard(b); setWinner(w); setWinnerUsername(wu); setIsDraw(d); setShowResult(true);
    };
    const onClosed = () => {
      if (!mountedRef.current) return;
      setBoard(Array(9).fill(null)); setMySymbol(null); setCurrentPlayer(null);
      setWinner(null); setIsDraw(false); setShowResult(false); setGameStarted(false);
    };

    socket.on('game-your-symbol', onYourSymbol);
    socket.on('game-started-xox', onStarted);
    socket.on('game-update-xox', onUpdate);
    socket.on('game-ended-xox', onEnded);
    socket.on('game-closed-xox', onClosed);

    return () => {
      mountedRef.current = false;
      socket.off('game-your-symbol', onYourSymbol);
      socket.off('game-started-xox', onStarted);
      socket.off('game-update-xox', onUpdate);
      socket.off('game-ended-xox', onEnded);
      socket.off('game-closed-xox', onClosed);
    };
  }, [socket]);

  const handleMove = useCallback((index) => {
    if (board[index] || winner || isDraw || currentPlayer !== myId || !gameStarted) return;
    socket.emit('game-move-xox', { index });
  }, [board, winner, isDraw, currentPlayer, myId, gameStarted, socket]);

  // Tekrar Oyna: start-game ile senkronize
  const handleRestart = useCallback(() => {
    socket.emit('start-game', { game: 'xox' });
  }, [socket]);

  const isMyTurn = currentPlayer === myId && gameStarted;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" style={{ pointerEvents: dragging ? 'none' : 'auto' }}>
      <div className="card-glass max-w-xs w-full mx-4 animate-fade-in"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, cursor: dragging ? 'grabbing' : 'auto' }}>

        <div onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
          className="flex items-center justify-between mb-4 cursor-grab active:cursor-grabbing select-none px-3 py-2 -mx-3 -mt-3 rounded-t-3xl hover:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg font-bold text-white">XOX</div>
            <div>
              <h2 className="text-lg font-semibold text-white">XOX</h2>
              <p className="text-xs text-gray-400">
                {!gameStarted ? 'Başlatılıyor...' : showResult
                  ? (isDraw ? '🤝 Berabere!' : winner === myId ? '🎉 Sen kazandın!' : '😔 Kaybettin!')
                  : mySymbol ? `Sen: ${mySymbol} ${isMyTurn ? '🎯 Senin sıran' : '⏳ Rakip oynuyor'}` : 'Başlıyor...'}
              </p>
            </div>
          </div>
          <button onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
            onClick={() => { socket.emit('game-reset-xox'); onClose(); }}
            className="w-8 h-8 rounded-full glass text-gray-400 hover:text-white flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {gameStarted && !showResult && (
          <div className="text-center mb-4">
            <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium ${isMyTurn ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'}`}>
              <span className={`w-2 h-2 rounded-full ${isMyTurn ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
              {isMyTurn ? '🎯 Senin sıran!' : '⏳ Rakibin sırası...'}
            </span>
          </div>
        )}

        {!gameStarted && (
          <div className="flex items-center justify-center py-12">
            <svg className="w-8 h-8 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        )}

        {gameStarted && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {board.map((cell, index) => (
              <button key={index} onClick={() => handleMove(index)}
                disabled={!!cell || !isMyTurn || !!winner || isDraw}
                className={`aspect-square rounded-xl text-3xl font-bold flex items-center justify-center transition-all duration-200
                  ${cell
                    ? (cell === 'X' ? 'bg-gradient-to-br from-purple-500/30 to-pink-500/30 text-purple-300 border border-purple-500/30' : 'bg-gradient-to-br from-blue-500/30 to-cyan-500/30 text-blue-300 border border-blue-500/30')
                    : 'bg-glass hover:bg-glass-light border border-glass-border active:scale-95'}
                  ${!cell && isMyTurn && !winner && !isDraw ? 'cursor-pointer hover:border-white/40' : 'cursor-default'}`}
                style={{ textShadow: cell === 'X' ? '0 0 20px rgba(168,85,247,0.5)' : '0 0 20px rgba(59,130,246,0.5)' }}>
                {cell || ''}
              </button>
            ))}
          </div>
        )}

        {showResult && (
          <div className="text-center mb-4 animate-slide-up">
            <div className="text-4xl mb-2">{isDraw ? '🤝' : winner === myId ? '🎉' : '😔'}</div>
            {isDraw
              ? <div className="text-yellow-400 font-semibold text-lg">Berabere!</div>
              : <div className={`font-semibold text-lg ${winner === myId ? 'text-green-400' : 'text-red-400'}`}>
                  {winner === myId ? 'Sen kazandın!' : `${winnerUsername || 'Rakip'} kazandı!`}
                </div>}
          </div>
        )}

        {gameStarted && mySymbol && !showResult && (
          <div className="flex items-center justify-center gap-4 text-sm text-gray-400 mt-2">
            <div className={`flex items-center gap-1.5 ${isMyTurn ? 'text-white' : ''}`}>
              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${mySymbol === 'X' ? 'bg-purple-500/30 text-purple-300' : 'bg-blue-500/30 text-blue-300'}`}>{mySymbol}</div>
              <span>Sen</span>
            </div>
            <span className="text-gray-500">vs</span>
            <div className={`flex items-center gap-1.5 ${!isMyTurn && gameStarted ? 'text-white' : ''}`}>
              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${mySymbol === 'O' ? 'bg-purple-500/30 text-purple-300' : 'bg-blue-500/30 text-blue-300'}`}>{mySymbol === 'X' ? 'O' : 'X'}</div>
              <span>Rakip</span>
            </div>
          </div>
        )}

        {showResult && (
          <button onClick={handleRestart}
            className="w-full py-3 mt-4 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-sm hover:from-purple-600 hover:to-pink-600 active:scale-95 transition-all">
            🔄 Yeniden Oyna
          </button>
        )}
      </div>
    </div>
  );
}
