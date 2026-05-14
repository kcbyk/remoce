import { useRef, useCallback, useState, useEffect } from 'react';

export function useWebRTC(socket, myId) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);

  // Kamerayı başlat
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16 / 9 },
          facingMode: 'user',
        },
        audio: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Kamera hatası:', err);
      return null;
    }
  }, []);

  // PeerConnection oluştur
  const createPeerConnection = useCallback((targetId, initiator, stream) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && socket?.current?.connected) {
        socket.current.emit('ice-candidate', { to: targetId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        pc.close();
        delete peersRef.current[targetId];
        setRemoteStream(null);
      }
    };

    if (initiator) {
      setTimeout(() => {
        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .then(() => {
            if (socket?.current?.connected) {
              socket.current.emit('offer', { to: targetId, offer: pc.localDescription });
            }
          })
          .catch(err => console.error('Offer hatası:', err));
      }, 500);
    }

    peersRef.current[targetId] = pc;
    return pc;
  }, [socket]);

  // WebRTC sinyallerini dinle
  useEffect(() => {
    if (!socket?.current || !myId) return;

    const handleOffer = async ({ from, offer }) => {
      try {
        const stream = localStreamRef.current;
        const pc = createPeerConnection(from, false, stream);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.current.emit('answer', { to: from, answer: pc.localDescription });
      } catch (err) {
        console.error('Offer işleme hatası:', err);
      }
    };

    const handleAnswer = async ({ from, answer }) => {
      const pc = peersRef.current[from];
      if (pc && pc.currentRemoteDescription === null) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Answer hatası:', err);
        }
      }
    };

    const handleIce = async ({ from, candidate }) => {
      const pc = peersRef.current[from];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {}
      }
    };

    socket.current.on('offer', handleOffer);
    socket.current.on('answer', handleAnswer);
    socket.current.on('ice-candidate', handleIce);

    return () => {
      if (socket.current) {
        socket.current.off('offer', handleOffer);
        socket.current.off('answer', handleAnswer);
        socket.current.off('ice-candidate', handleIce);
      }
    };
  }, [socket, myId, createPeerConnection]);

  // Peer bağlantısı başlat
  const initiatePeerConnection = useCallback((targetId) => {
    const stream = localStreamRef.current;
    if (stream && !peersRef.current[targetId]) {
      createPeerConnection(targetId, true, stream);
    }
  }, [createPeerConnection]);

  // Mikrofon toggle
  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      const enabled = !micEnabled;
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = enabled);
      setMicEnabled(enabled);
    }
  }, [micEnabled]);

  // Kamera toggle
  const toggleCam = useCallback(() => {
    if (localStreamRef.current) {
      const enabled = !camEnabled;
      localStreamRef.current.getVideoTracks().forEach(t => t.enabled = enabled);
      setCamEnabled(enabled);
    }
  }, [camEnabled]);

  // Temizlik
  const cleanup = useCallback(() => {
    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  return {
    localStream,
    remoteStream,
    micEnabled,
    camEnabled,
    startCamera,
    initiatePeerConnection,
    toggleMic,
    toggleCam,
    cleanup,
  };
}
