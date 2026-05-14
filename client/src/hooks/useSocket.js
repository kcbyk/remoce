import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

function getSocketCandidates() {
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (envUrl) return [envUrl];
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (backendUrl) return [backendUrl];
  if (import.meta.env.DEV) return ['http://localhost:3001', 'http://localhost:3002', ''];
  return [''];
}

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState(null);
  const attemptRef = useRef({ candidates: [], index: 0, switching: false });

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.disconnect();
    }

    const candidates = getSocketCandidates();
    attemptRef.current = { candidates, index: 0, switching: false };

    const connectTo = (idx) => {
      const url = candidates[idx] ?? '';
      const socket = io(url, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('✅ Socket bağlandı:', socket.id);
        setConnected(true);
        setSocketId(socket.id);
      });

      socket.on('disconnect', () => {
        console.log('❌ Socket bağlantısı koptu');
        setConnected(false);
      });

      socket.on('connect_error', (err) => {
        console.error('❌ Socket hatası:', err.message);
        const a = attemptRef.current;
        if (a.switching) return;
        if (idx >= candidates.length - 1) return;
        a.switching = true;
        try { socket.removeAllListeners(); } catch { }
        try { socket.disconnect(); } catch { }
        const nextIdx = idx + 1;
        attemptRef.current = { candidates, index: nextIdx, switching: false };
        connectTo(nextIdx);
      });

      return socket;
    };

    return connectTo(0);
  }, []);

  const createRoom = useCallback((username) => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current?.connected) { reject('Socket bağlı değil'); return; }
      socketRef.current.emit('create-room', username, (response) => {
        if (response.success) resolve(response);
        else reject(response.error);
      });
    });
  }, []);

  const joinRoom = useCallback((username, roomId) => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current?.connected) { reject('Socket bağlı değil'); return; }
      socketRef.current.emit('join-room', { roomId, username }, (response) => {
        if (response.success) resolve(response);
        else reject(response.error);
      });
    });
  }, []);

  const waitForConnection = useCallback(() => {
    return new Promise((resolve) => {
      if (socketRef.current?.connected) { resolve(); return; }
      const check = setInterval(() => {
        if (socketRef.current?.connected) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      // Timeout after 5 seconds
      setTimeout(() => { clearInterval(check); resolve(); }, 5000);
    });
  }, []);

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) socketRef.current.emit(event, data);
  }, []);

  const on = useCallback((event, handler) => {
    if (socketRef.current) socketRef.current.on(event, handler);
  }, []);

  const off = useCallback((event, handler) => {
    if (socketRef.current) socketRef.current.off(event, handler);
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
      setSocketId(null);
    }
  }, []);

  return { connect, createRoom, joinRoom, waitForConnection, emit, on, off, disconnect, connected, socketId, socket: socketRef };
}
