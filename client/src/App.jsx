import React, { useState, useCallback, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { useWebRTC } from './hooks/useWebRTC';
import Lobby from './components/Lobby';
import WaitingRoom from './components/WaitingRoom';
import CallRoom from './components/CallRoom';

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [myId, setMyId] = useState('');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  const socket = useSocket();
  const webrtc = useWebRTC(socket.socket, myId);

  // Socket event'lerini yönet
  useEffect(() => {
    if (!socket.connected || !socket.socket?.current) return;

    const s = socket.socket.current;
    setMyId(s.id || socket.socketId || '');

    const onRoomUsers = (data) => setUsers(data);
    const onPeerJoined = ({ user, users: u }) => {
      setUsers(u);
      setScreen(prev => {
        if (prev === 'waiting') {
          if (user?.id && user.id !== s.id) webrtc.initiatePeerConnection(user.id);
          return 'call';
        }
        return prev;
      });
    };
    const onPeerLeft = ({ userId }) => {
      setScreen('waiting');
      setUsers(prev => prev.filter(u => u.id !== userId));
    };

    s.on('room-users', onRoomUsers);
    s.on('peer-joined', onPeerJoined);
    s.on('peer-left', onPeerLeft);

    return () => {
      s.off('room-users', onRoomUsers);
      s.off('peer-joined', onPeerJoined);
      s.off('peer-left', onPeerLeft);
    };
  }, [socket.connected, socket.socketId]);

  // Oda kur
  const handleCreateRoom = useCallback(async (name) => {
    setError('');
    setUsername(name);

    // Zaten bağlıysa yeniden bağlanma
    if (!socket.socket?.current?.connected) {
      socket.connect();
    }

    await socket.waitForConnection();

    // waitForConnection sonrası direkt ref'i kontrol et (state değil)
    if (!socket.socket?.current?.connected) {
      setError('Sunucuya bağlanılamadı! Lütfen tekrar deneyin.');
      return;
    }

    try {
      const result = await socket.createRoom(name);
      setMyId(socket.socket.current.id || socket.socketId || '');
      setRoomId(result.roomId);
      setScreen('waiting');
      await webrtc.startCamera();
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Oda oluşturulamadı!');
    }
  }, [socket, webrtc]);

  // Odaya katıl
  const handleJoinRoom = useCallback(async (name, code) => {
    setError('');
    setUsername(name);

    if (!socket.socket?.current?.connected) {
      socket.connect();
    }

    await socket.waitForConnection();

    if (!socket.socket?.current?.connected) {
      setError('Sunucuya bağlanılamadı! Lütfen tekrar deneyin.');
      return;
    }

    try {
      const result = await socket.joinRoom(name, code);
      setMyId(socket.socket.current.id || socket.socketId || '');
      setRoomId(result.roomId);
      setScreen('waiting');
      await webrtc.startCamera();
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Odaya katılınamadı!');
    }
  }, [socket, webrtc]);

  // Çıkış
  const handleLeave = useCallback(() => {
    webrtc.cleanup();
    socket.disconnect();
    setScreen('lobby');
    setRoomId('');
    setMyId('');
    setUsers([]);
    setUsername('');
    setError('');
  }, [socket, webrtc]);

  return (
    <div className="w-full h-full bg-dark-900 overflow-hidden relative">
      {screen === 'lobby' && (
        <Lobby
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onClearError={() => setError('')}
          error={error}
        />
      )}
      {screen === 'waiting' && (
        <WaitingRoom
          roomId={roomId}
          username={username}
          localStream={webrtc.localStream}
          users={users}
          onLeave={handleLeave}
        />
      )}
      {screen === 'call' && (
        <CallRoom
          roomId={roomId}
          username={username}
          myId={myId}
          localStream={webrtc.localStream}
          remoteStream={webrtc.remoteStream}
          micEnabled={webrtc.micEnabled}
          camEnabled={webrtc.camEnabled}
          users={users}
          socket={socket.socket.current}
          onToggleMic={webrtc.toggleMic}
          onToggleCam={webrtc.toggleCam}
          onLeave={handleLeave}
        />
      )}
    </div>
  );
}
