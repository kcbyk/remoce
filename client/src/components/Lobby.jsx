import React, { useState } from 'react';

export default function Lobby({ onCreateRoom, onJoinRoom, onClearError, error }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    await onCreateRoom(name.trim());
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!name.trim() || !code.trim()) return;
    setLoading(true);
    await onJoinRoom(name.trim(), code.trim().toUpperCase());
    setLoading(false);
  };

  return (
    <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
      {/* Arka plan efektleri */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      {/* İçerik */}
      <div className="relative z-10 w-full max-w-md px-6 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 
                        flex items-center justify-center shadow-lg shadow-green-500/20 animate-glow">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-gradient mb-2">Remoce</h1>
          <p className="text-gray-400 text-sm">Görüntülü Sohbet & Oyun</p>
        </div>

        {/* Menü */}
        {!mode && (
          <div className="space-y-4 animate-slide-up">
            <button
              onClick={() => setMode('create')}
              className="btn-glass-green w-full"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Oda Kur
            </button>
            <button
              onClick={() => setMode('join')}
              className="btn-glass-blue w-full"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Odaya Katıl
            </button>
          </div>
        )}

        {/* Oda Kur Formu */}
        {mode === 'create' && (
          <div className="card-glass animate-slide-up">
            <button
              onClick={() => { setMode(null); onClearError?.(); }}
              className="text-gray-400 hover:text-white transition-colors mb-4 flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Geri
            </button>
            <h2 className="text-2xl font-semibold text-white mb-6 text-center">Oda Kur</h2>
            <input
              type="text"
              placeholder="Kullanıcı adın"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="input-glass mb-4"
              maxLength={20}
              autoFocus
            />
            {error && <p className="text-red-400 text-sm mb-3 text-center">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={loading || !name.trim()}
              className="btn-glass-green w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              )}
              {loading ? 'Oluşturuluyor...' : 'Oda Kur'}
            </button>
          </div>
        )}

        {/* Odaya Katıl Formu */}
        {mode === 'join' && (
          <div className="card-glass animate-slide-up">
            <button
              onClick={() => { setMode(null); onClearError?.(); }}
              className="text-gray-400 hover:text-white transition-colors mb-4 flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Geri
            </button>
            <h2 className="text-2xl font-semibold text-white mb-6 text-center">Odaya Katıl</h2>
            <input
              type="text"
              placeholder="Kullanıcı adın"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-glass mb-3"
              maxLength={20}
              autoFocus
            />
            <input
              type="text"
              placeholder="Oda kodu"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              className="input-glass mb-4 tracking-widest font-mono text-center text-xl"
              maxLength={6}
            />
            {error && <p className="text-red-400 text-sm mb-3 text-center">{error}</p>}
            <button
              onClick={handleJoin}
              disabled={loading || !name.trim() || !code.trim()}
              className="btn-glass-blue w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
              )}
              {loading ? 'Katılıyor...' : 'Katıl'}
            </button>
          </div>
        )}

        <p className="text-gray-500 text-xs text-center mt-8">
          Kamerana ve mikrofonuna erişim izni vermen gerekecek.
        </p>
      </div>
    </div>
  );
}
