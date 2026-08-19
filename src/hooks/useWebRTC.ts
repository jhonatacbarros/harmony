import { useState, useRef, useCallback, useEffect } from 'react';
import { StreamSettings, StreamStatus } from '../types';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
};

export function useWebRTC(settings: StreamSettings) {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);

  // Stop all media tracks and peer connections
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setStream(null);
    setViewerCount(0);
    setStatus('idle');
  }, []);

  // Handle incoming viewer connection
  const handleViewerOffer = useCallback(async (viewerId: string, offer: RTCSessionDescriptionInit) => {
    if (!streamRef.current) return;

    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peersRef.current.set(viewerId, pc);

      // Add all tracks from the captured screen/audio stream
      streamRef.current.getTracks().forEach((track) => {
        if (streamRef.current) {
          pc.addTrack(track, streamRef.current);
        }
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              type: 'candidate',
              targetId: viewerId,
              payload: event.candidate,
            })
          );
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          pc.close();
          peersRef.current.delete(viewerId);
          setViewerCount(peersRef.current.size);
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'answer',
            targetId: viewerId,
            payload: answer,
          })
        );
      }

      setViewerCount(peersRef.current.size);
    } catch (err) {
      console.error(`Error handling offer from viewer ${viewerId}:`, err);
    }
  }, []);

  // Connect to local Rust WebSocket signaling server
  const connectSignaling = useCallback((port: number, pin: string) => {
    const wsUrl = `ws://localhost:${port}/ws/host?pin=${encodeURIComponent(pin)}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to local signaling server');
      setStatus('live');
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'offer' && msg.senderId && msg.payload) {
          await handleViewerOffer(msg.senderId, msg.payload);
        } else if (msg.type === 'candidate' && msg.senderId && msg.payload) {
          const pc = peersRef.current.get(msg.senderId);
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
          }
        } else if (msg.type === 'viewer_left' && msg.senderId) {
          const pc = peersRef.current.get(msg.senderId);
          if (pc) {
            pc.close();
            peersRef.current.delete(msg.senderId);
            setViewerCount(peersRef.current.size);
          }
        }
      } catch (err) {
        console.error('Error parsing signaling message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('Signaling WebSocket error:', err);
    };

    ws.onclose = () => {
      console.log('Signaling WebSocket disconnected');
    };
  }, [handleViewerOffer]);

  // Start screen and audio capture
  const startStream = useCallback(async () => {
    try {
      setErrorMessage(null);
      setStatus('starting');

      const width = settings.quality === '1080p' ? 1920 : 1280;
      const height = settings.quality === '1080p' ? 1080 : 720;

      // Request screen capture with audio
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: width, max: width },
          height: { ideal: height, max: height },
          frameRate: { ideal: settings.fps, max: settings.fps },
        },
        audio: settings.enableAudio,
      });

      // Handle user stopping stream from the native browser/OS banner
      displayStream.getVideoTracks()[0].onended = () => {
        stopStream();
      };

      let finalStream = displayStream;

      // If microphone is enabled, mix mic audio track
      if (settings.enableMic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioCtx = new AudioContext();
          const destination = audioCtx.createMediaStreamDestination();

          if (displayStream.getAudioTracks().length > 0) {
            const displayAudioSource = audioCtx.createMediaStreamSource(displayStream);
            displayAudioSource.connect(destination);
          }

          const micAudioSource = audioCtx.createMediaStreamSource(micStream);
          micAudioSource.connect(destination);

          // Create combined stream
          const mixedAudioTrack = destination.stream.getAudioTracks()[0];
          finalStream = new MediaStream([
            displayStream.getVideoTracks()[0],
            mixedAudioTrack,
          ]);
        } catch (micErr) {
          console.warn('Microphone permission denied or unavailable:', micErr);
        }
      }

      streamRef.current = finalStream;
      setStream(finalStream);

      // Connect to local signaling server
      connectSignaling(settings.port, settings.pin);
    } catch (err: any) {
      console.error('Failed to start stream:', err);
      setStatus('error');
      setErrorMessage(err?.message || 'Permissão de captura negada ou erro inesperado.');
      cleanup();
    }
  }, [settings, connectSignaling, cleanup]);

  // Pause / Resume transmission (mutes video/audio track without closing peer connections)
  const togglePause = useCallback(() => {
    if (!streamRef.current) return;

    if (status === 'live') {
      streamRef.current.getVideoTracks().forEach((t) => (t.enabled = false));
      streamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
      setStatus('paused');

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'status', payload: 'paused' }));
      }
    } else if (status === 'paused') {
      streamRef.current.getVideoTracks().forEach((t) => (t.enabled = true));
      streamRef.current.getAudioTracks().forEach((t) => (t.enabled = true));
      setStatus('live');

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'status', payload: 'live' }));
      }
    }
  }, [status]);

  // Stop transmission completely
  const stopStream = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    status,
    stream,
    viewerCount,
    errorMessage,
    startStream,
    togglePause,
    stopStream,
  };
}
