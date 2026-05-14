import React, { useState, useEffect, useCallback, useRef } from 'react';

export default function RiddleGame({ socket, myId, onClose }) {
  const [phase, setPhase] = useState('waiting');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState('');
  const [scores, setScores] = useState({});
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(10);
  const [deadline, setDeadline] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
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

  const submitAnswer = useCallback(() => {
    if (!answer.trim() || phase !== 'playing') return;
    socket.emit('game-answer-riddle', { answer: answer.trim() });
    setAnswer('');
  }, [answer, phase, socket]);

  useEffect(() => {
    if (!deadline || phase !== 'playing') { setTimeLeft(null); return; }
    const tick = () => {
      const ms = deadline - Date.now();
      setTimeLeft(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [deadline, phase]);

  useEffect(() => {
    if (!socket) return;
    mountedRef.current = true;

    const onStarted = ({ question: q, round: r, totalRounds: tr, scores: sc, deadline: dl }) => {
      if (!mountedRef.current) return;
      setQuestion(q);
      setRound(r);
      setTotalRounds(tr);
      setScores(sc || {});
      setDeadline(dl || null);
      setFeedback('');
      setFeedbackType('');
      setResult(null);
      setPhase('playing');
    };
    const onNext = ({ question: q, round: r, totalRounds: tr, scores: sc, deadline: dl }) => {
      if (!mountedRef.current) return;
      setQuestion(q);
      setRound(r);
      setTotalRounds(tr);
      setScores(sc || {});
      setDeadline(dl || null);
      setFeedback('');
      setFeedbackType('');
      setResult(null);
      setAnswer('');
      setPhase('playing');
    };
    const onWrong = ({ username }) => {
      if (!mountedRef.current) return;
      setFeedback(`${username || 'Rakip'} yanlış denedi.`);
      setFeedbackType('info');
      setTimeout(() => { if (mountedRef.current) { setFeedback(''); setFeedbackType(''); } }, 1200);
    };
    const onCorrect = ({ userId, username, answer: a, scores: sc }) => {
      if (!mountedRef.current) return;
      setScores(sc || {});
      setFeedback(`${username || (userId === myId ? 'Sen' : 'Rakip')} bildi: ${a} ✅`);
      setFeedbackType(userId === myId ? 'correct' : 'wrong');
      setDeadline(null);
      setTimeout(() => { if (mountedRef.current) { setFeedback(''); setFeedbackType(''); } }, 1200);
    };
    const onReveal = ({ answer: a, scores: sc }) => {
      if (!mountedRef.current) return;
      setScores(sc || {});
      setFeedback(`Cevap: ${a}`);
      setFeedbackType('info');
      setDeadline(null);
      setTimeout(() => { if (mountedRef.current) { setFeedback(''); setFeedbackType(''); } }, 1200);
    };
    const onTimeout = ({ answer: a, scores: sc }) => {
      if (!mountedRef.current) return;
      setScores(sc || {});
      setFeedback(`Süre doldu! Cevap: ${a}`);
      setFeedbackType('info');
      setDeadline(null);
      setTimeout(() => { if (mountedRef.current) { setFeedback(''); setFeedbackType(''); } }, 1200);
    };
    const onEnded = ({ winner, scores: sc }) => {
      if (!mountedRef.current) return;
      setScores(sc || {});
      if (!winner) setResult('draw');
      else if (winner === myId) setResult('win');
      else setResult('lose');
      setPhase('result');
      setDeadline(null);
    };
    const onClosed = () => {
      if (!mountedRef.current) return;
      setPhase('waiting');
      setQuestion('');
      setFeedback('');
      setFeedbackType('');
      setDeadline(null);
      setResult(null);
      setAnswer('');
      setRound(1);
      setTotalRounds(10);
      setScores({});
    };

    socket.on('game-started-riddle', onStarted);
    socket.on('game-next-riddle', onNext);
    socket.on('game-riddle-wrong', onWrong);
    socket.on('game-riddle-correct', onCorrect);
    socket.on('game-riddle-reveal', onReveal);
    socket.on('game-riddle-timeout', onTimeout);
    socket.on('game-ended-riddle', onEnded);
    socket.on('game-closed-riddle', onClosed);

    return () => {
      mountedRef.current = false;
      socket.off('game-started-riddle', onStarted);
      socket.off('game-next-riddle', onNext);
      socket.off('game-riddle-wrong', onWrong);
      socket.off('game-riddle-correct', onCorrect);
      socket.off('game-riddle-reveal', onReveal);
      socket.off('game-riddle-timeout', onTimeout);
      socket.off('game-ended-riddle', onEnded);
      socket.off('game-closed-riddle', onClosed);
    };
  }, [socket, myId]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" style={{ pointerEvents: dragging ? 'none' : 'auto' }}>
      <div className="card-glass max-w-sm w-full mx-4 animate-fade-in"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, cursor: dragging ? 'grabbing' : 'auto' }}>
        
        <div onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
          className="flex items-center justify-between mb-4 cursor-grab active:cursor-grabbing select-none px-3 py-2 -mx-3 -mt-3 rounded-t-3xl hover:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-lg text-white">🎯</div>
            <div>
              <h2 className="text-lg font-semibold text-white">Bilmece</h2>
              <p className="text-xs text-gray-400">
                {phase === 'waiting' ? 'Başlatılıyor...' : phase === 'playing' ? `Soru ${round}/${totalRounds}` : 'Oyun bitti!'}
              </p>
            </div>
          </div>
          <button onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
            onClick={() => { socket.emit('game-reset-riddle'); onClose(); }} className="w-8 h-8 rounded-full glass text-gray-400 hover:text-white flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {phase === 'waiting' && (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🎯</div>
            <p className="text-gray-400 mb-2">Bilmeceler yükleniyor...</p>
            <div className="flex items-center justify-center py-6">
              <svg className="w-8 h-8 text-green-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            </div>
          </div>
        )}

        {phase === 'playing' && question && (
          <>
            <div className="text-center mb-4">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                <span>Soru {round} / {totalRounds}</span>
                {timeLeft !== null && <span>Süre: <span className="text-white font-semibold">{timeLeft}s</span></span>}
              </div>
              <div className="glass rounded-2xl px-5 py-6 text-lg font-medium text-white leading-relaxed">
                {question}
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <input type="text" value={answer} onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
                className="flex-1 px-4 py-3 rounded-2xl bg-glass backdrop-blur-xl border border-glass-border text-white placeholder-gray-500 focus:border-white/40 focus:outline-none text-lg" placeholder="Cevabın ne?" autoFocus />
              <button onClick={submitAnswer} disabled={!answer.trim()}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold disabled:opacity-50 hover:from-green-600 hover:to-emerald-600 active:scale-95 transition-all">Gönder</button>
            </div>

            {feedback && (
              <div className={`mb-4 px-4 py-3 rounded-2xl text-center font-medium ${
                feedbackType === 'correct' ? 'bg-green-500/20 text-green-400' :
                feedbackType === 'wrong' ? 'bg-red-500/20 text-red-400' :
                'bg-gray-500/20 text-gray-300'
              }`}>
                {feedback}
              </div>
            )}

            {/* Skor */}
            <div className="glass rounded-xl px-4 py-2 text-sm flex items-center justify-between">
              <span className="text-gray-400">Skorun:</span>
              <span className="text-white font-bold">{scores[myId] || 0} puan</span>
            </div>
          </>
        )}

        {phase === 'result' && (
          <div className="text-center py-6 animate-slide-up">
            <div className="text-5xl mb-3">{result === 'win' ? '🎉' : result === 'lose' ? '😔' : '🤝'}</div>
            <div className={`text-2xl font-bold mb-2 ${result === 'win' ? 'text-green-400' : result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
              {result === 'win' ? 'Tebrikler, kazandın!' : result === 'lose' ? 'Kaybettin!' : 'Berabere!'}
            </div>
            <p className="text-gray-400 mb-2">Skorun: <span className="text-white font-bold">{scores[myId] || 0}</span></p>
            <button onClick={() => socket.emit('start-game', { game: 'riddle' })}
              className="w-full py-3 mt-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold hover:from-green-600 hover:to-emerald-600 active:scale-95 transition-all">
              🔄 Tekrar Oyna
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
