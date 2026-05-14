import React, { useRef, useEffect, useState } from 'react';

export default function WaitingRoom({ roomId, username, localStream, users, onLeave }) {
  const videoRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Arka plan kamerası */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-sm"
        style={{ transform: 'scaleX(-1)', objectPosition: 'center 38%' }}
      />
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* İçerik */}
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6">
        {/* Oda Kodu Kartı */}
        <div className="card-glass text-center max-w-sm w-full animate-slide-up">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-400/20 to-emerald-500/20 
                        border border-green-400/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>

          <p className="text-gray-400 text-sm mb-3">Oda Kodu</p>
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="text-4xl font-bold tracking-[0.3em] text-white font-mono">
              {roomId}
            </span>
          </div>

          <button
            onClick={handleCopy}
            className="w-full py-3 px-6 rounded-2xl bg-glass hover:bg-glass-light 
                       border border-glass-border text-white font-medium
                       transition-all duration-300 flex items-center justify-center gap-2
                       active:scale-95 mb-4"
          >
            {copied ? (
              <>
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Kopyalandı!
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
                Kopyala
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Arkadaşın bekleniyor...
          </div>
        </div>

        {/* Kamera önizleme */}
        <div className="mt-6 glass rounded-2xl overflow-hidden w-48 h-36 relative animate-slide-up">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)', objectPosition: 'center 38%' }}
          />
          <div className="absolute bottom-2 left-2 glass rounded-lg px-2 py-1 text-xs text-white/80">
            {username}
          </div>
        </div>

        {/* Çıkış */}
        <button
          onClick={onLeave}
          className="mt-8 text-gray-400 hover:text-red-400 transition-colors flex items-center gap-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12" />
          </svg>
          Çıkış Yap
        </button>
      </div>
    </div>
  );
}
