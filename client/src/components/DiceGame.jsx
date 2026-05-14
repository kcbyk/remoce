import React, { useState, useEffect, useCallback, useRef } from 'react';

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default function DiceGame({ socket, myId, onClose }) {
  const [phase, setPhase] = useState('waiting');
  const [myRoll, setMyRoll] = useState(null);
  const [opRoll, setOpRoll] = useState(null);
  const [result, setResult] = useState(null);
  const [scores, setScores] = useState({ me: 0, opp: 0 });
  const [round, setRound] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [hasRolled, setHasRolled] = useState(false);
  const [oppHasRolled, setOppHasRolled] = useState(false);
  const [rolling, setRolling] = useState(false);
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

    const onStarted = () => {
      if (!mountedRef.current) return;
      setPhase('playing');
      setMyRoll(null); setOpRoll(null); setResult(null);
      setHasRolled(false); setOppHasRolled(false);
      setGameOver(false); setRolling(false);
      setRound(1); setScores({ me: 0, opp: 0 });
    };

    // Rakip zar attı ama sonuç henüz açıklanmadı
    const onPlayerRolled = ({ userId, d1, d2, total }) => {
      if (!mountedRef.current) return;
      if (userId !== myId) {
        // Rakip attı - zarlarını göster
        setOpRoll({ d1, d2, total });
        setOppHasRolled(true);
      }
    };

    const onResult = ({ rolls, winner, isDraw, winnerUsername, scores: s, round: r, gameOver: go }) => {
      if (!mountedRef.current) return;
      const myRollData = rolls[myId];
      const oppId = Object.keys(rolls).find(id => id !== myId);
      const oppRollData = rolls[oppId];

      setMyRoll(myRollData);
      setOpRoll(oppRollData);
      setResult(isDraw ? 'draw' : winner === myId ? 'win' : 'lose');

      const newScores = { me: 0, opp: 0 };
      if (s) {
        newScores.me = s[myId] || 0;
        if (oppId) newScores.opp = s[oppId] || 0;
      }
      setScores(newScores);
      setRound(r);
      setGameOver(go);
      setOppHasRolled(true);

      if (!go) {
        setTimeout(() => {
          if (mountedRef.current) {
            setMyRoll(null); setOpRoll(null); setResult(null);
            setHasRolled(false); setOppHasRolled(false);
            setRound(r + 1);
          }
        }, 2500);
      }
    };

    const onClosed = () => {
      if (!mountedRef.current) return;
      setPhase('waiting');
    };

    socket.on('game-started-dice', onStarted);
    socket.on('game-player-rolled', onPlayerRolled);
    socket.on('game-result-dice', onResult);
    socket.on('game-closed-dice', onClosed);
    return () => {
      mountedRef.current = false;
      socket.off('game-started-dice', onStarted);
      socket.off('game-player-rolled', onPlayerRolled);
      socket.off('game-result-dice', onResult);
      socket.off('game-closed-dice', onClosed);
    };
  }, [socket, myId]);

  const rollDice = useCallback(() => {
    if (hasRolled || rolling || gameOver || phase !== 'playing') return;
    setRolling(true);
    setTimeout(() => {
      if (mountedRef.current) {
        socket.emit('game-roll-dice');
        setHasRolled(true);
        setRolling(false);
      }
    }, 600);
  }, [hasRolled, rolling, gameOver, phase, socket]);

  // Tekrar Oyna: start-game ile senkronize
  const handleRestart = useCallback(() => {
    socket.emit('start-game', { game: 'dice' });
  }, [socket]);

  const diceFace = (n) => n >= 1 && n <= 6 ? DICE_FACES[n - 1] : '🎲';

  const getStatusText = () => {
    if (phase === 'waiting') return 'Başlatılıyor...';
    if (gameOver) return scores.me > scores.opp ? '🏆 Oyunu kazandın!' : scores.me < scores.opp ? '💔 Oyunu kaybettin!' : '🤝 Berabere!';
    if (result) return result === 'win' ? '🎉 Bu turu kazandın!' : result === 'lose' ? '😔 Bu turu kaybettin!' : '🤝 Berabere!';
    if (rolling) return '🎲 Zar atılıyor...';
    if (hasRolled && !oppHasRolled) return '⏳ Rakibin zarı bekleniyor...';
    if (!hasRolled && oppHasRolled) return '🎲 Rakip attı! Sıra sende!';
    return '🎲 Zar at!';
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" style={{ pointerEvents: dragging ? 'none' : 'auto' }}>
      <div className="card-glass max-w-sm w-full mx-4 animate-fade-in" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>

        {/* Header */}
        <div onMouseDown={(e) => hDS(e.clientX, e.clientY)} onTouchStart={(e) => hDS(e.touches[0].clientX, e.touches[0].clientY)}
          className="flex items-center justify-between mb-3 cursor-grab active:cursor-grabbing select-none px-3 py-2 -mx-3 -mt-3 rounded-t-3xl hover:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-lg text-white">🎲</div>
            <div>
              <h2 className="text-lg font-semibold text-white">Zar Oyunu</h2>
              <p className="text-xs text-gray-400">{getStatusText()}</p>
            </div>
          </div>
          <button onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
            onClick={() => { socket.emit('game-reset-dice'); onClose(); }}
            className="w-8 h-8 rounded-full glass text-gray-400 hover:text-white flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {phase === 'waiting' && (
          <div className="flex items-center justify-center py-10">
            <svg className="w-8 h-8 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        )}

        {phase === 'playing' && (
          <>
            {/* Tur & Skor */}
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="glass rounded-xl px-3 py-2 text-center min-w-[60px]">
                <div className="text-xl font-bold text-green-400">{scores.me}</div>
                <div className="text-xs text-gray-400">Sen</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400 mb-0.5">Tur</div>
                <div className="text-xl font-bold text-white">{Math.min(round, 5)}/5</div>
              </div>
              <div className="glass rounded-xl px-3 py-2 text-center min-w-[60px]">
                <div className="text-xl font-bold text-blue-400">{scores.opp}</div>
                <div className="text-xs text-gray-400">Rakip</div>
              </div>
            </div>

            {/* Zar gösterimi */}
            <div className="flex items-stretch justify-center gap-4 mb-4">
              {/* Sen */}
              <div className="flex-1 glass rounded-2xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-2">Sen</div>
                <div className={`text-4xl leading-tight transition-all duration-300 ${rolling ? 'animate-spin' : ''}`}>
                  {myRoll
                    ? <span>{diceFace(myRoll.d1)} {diceFace(myRoll.d2)}</span>
                    : hasRolled
                      ? <span className="text-green-400 text-2xl">✓</span>
                      : <span className="opacity-40">🎲 🎲</span>}
                </div>
                {myRoll && (
                  <div className="text-lg font-bold text-white mt-1">{myRoll.total}</div>
                )}
                {hasRolled && !myRoll && (
                  <div className="text-xs text-green-400 mt-1">Atıldı!</div>
                )}
              </div>

              <div className="flex items-center text-gray-500 font-bold text-xl">vs</div>

              {/* Rakip */}
              <div className="flex-1 glass rounded-2xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-2">Rakip</div>
                <div className="text-4xl leading-tight">
                  {opRoll
                    ? <span>{diceFace(opRoll.d1)} {diceFace(opRoll.d2)}</span>
                    : oppHasRolled
                      ? <span className="text-green-400 text-2xl">✓</span>
                      : <span className="opacity-40">🎲 🎲</span>}
                </div>
                {opRoll && (
                  <div className="text-lg font-bold text-white mt-1">{opRoll.total}</div>
                )}
                {oppHasRolled && !opRoll && (
                  <div className="text-xs text-green-400 mt-1">Attı!</div>
                )}
              </div>
            </div>

            {/* Tur sonucu */}
            {result && (
              <div className={`text-center text-sm font-semibold mb-3 animate-fade-in ${result === 'win' ? 'text-green-400' : result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
                {result === 'win' ? '🎉 Bu turu kazandın!' : result === 'lose' ? '😔 Bu turu kaybettin!' : '🤝 Berabere!'}
              </div>
            )}

            {/* Zar at butonu */}
            {!hasRolled && !gameOver && (
              <button onClick={rollDice} disabled={rolling}
                className={`w-full py-3 rounded-2xl text-white font-semibold text-lg transition-all ${rolling ? 'bg-indigo-500/50 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 active:scale-95'}`}>
                {rolling ? '🎲 Atılıyor...' : '🎲 Zar At!'}
              </button>
            )}

            {hasRolled && !result && !gameOver && (
              <div className="text-center py-2">
                <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Rakibin zarı bekleniyor...
                </div>
              </div>
            )}

            {/* Oyun bitti */}
            {gameOver && (
              <div className="mt-2">
                <div className={`text-center text-lg font-bold mb-3 ${scores.me > scores.opp ? 'text-green-400' : scores.me < scores.opp ? 'text-red-400' : 'text-yellow-400'}`}>
                  {scores.me > scores.opp ? '🏆 Oyunu Kazandın!' : scores.me < scores.opp ? '💔 Oyunu Kaybettin!' : '🤝 Oyun Berabere!'}
                </div>
                <button onClick={handleRestart}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold text-sm hover:from-indigo-600 hover:to-purple-600 active:scale-95 transition-all">
                  🔄 Tekrar Oyna
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
