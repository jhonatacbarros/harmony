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

// Safe Tauri invoke helper
async function tauriInvoke<T>(cmd: string, args?: any): Promise<T | null> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    }
  } catch (err) {
    console.warn(`Tauri command '${cmd}' could not be executed:`, err);
  }
  return null;
}

export function useWebRTC(settings: StreamSettings) {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);
  const audioSocketRef = useRef<WebSocket | null>(null);

  // Audio Graph Nodes for real-time volume mixing
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gameGainRef = useRef<GainNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);

  // Dynamically update game audio and microphone volumes in real-time
  useEffect(() => {
    if (gameGainRef.current) {
      gameGainRef.current.gain.value = settings.gameVolume ?? 1.0;
    }
  }, [settings.gameVolume]);

  useEffect(() => {
    if (micGainRef.current) {
      micGainRef.current.gain.value = settings.micVolume ?? 1.0;
    }
  }, [settings.micVolume]);

  // Stop all media tracks, audio nodes, and peer connections
  const cleanup = useCallback(async () => {
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

    if (audioSocketRef.current) {
      audioSocketRef.current.close();
      audioSocketRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    gameGainRef.current = null;
    micGainRef.current = null;

    await tauriInvoke('stop_native_audio_capture');

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
              senderId: 'host',
              targetId: viewerId,
              payload: event.candidate,
            })
          );
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'answer',
            senderId: 'host',
            targetId: viewerId,
            payload: answer,
          })
        );
      }

      setViewerCount(peersRef.current.size);

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          peersRef.current.delete(viewerId);
          setViewerCount(peersRef.current.size);
        }
      };
    } catch (err) {
      console.error(`Error handling offer from viewer ${viewerId}:`, err);
    }
  }, []);

  // Connect to the local signaling server
  const connectSignaling = useCallback((port: number, pin: string) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/host?pin=${encodeURIComponent(pin)}`);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('Host connected to signaling server');
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

      // When target process is selected or Discord isolation is active,
      // we request video ONLY from getDisplayMedia (audio: false) to prevent Windows from mixing Discord!
      const shouldUseNativeProcessAudio = Boolean(settings.targetProcessName) || settings.isolateDiscord;

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: width, max: width },
          height: { ideal: height, max: height },
          frameRate: { ideal: settings.fps, max: settings.fps },
        },
        audio: shouldUseNativeProcessAudio ? false : settings.enableAudio,
      });

      // Handle user stopping stream from native browser/OS banner
      displayStream.getVideoTracks()[0].onended = () => {
        stopStream();
      };

      let finalStream = displayStream;

      // Build WebAudio Mixing Graph
      const audioCtx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = audioCtx;
      const destination = audioCtx.createMediaStreamDestination();

      let hasAudioTracks = false;

      // 1. Process/Game Audio Path
      if (settings.enableAudio) {
        if (shouldUseNativeProcessAudio) {
          // Trigger Rust native WASAPI loopback capture for target process
          await tauriInvoke('start_native_audio_capture', {
            processName: settings.targetProcessName || null,
          });

          // Connect to internal audio stream socket
          const audioWs = new WebSocket(`ws://localhost:${settings.port}/ws/audio_loopback`);
          audioSocketRef.current = audioWs;
          audioWs.binaryType = 'arraybuffer';

          const gameGain = audioCtx.createGain();
          gameGain.gain.value = settings.gameVolume ?? 1.0;
          gameGain.connect(destination);
          gameGainRef.current = gameGain;

          audioWs.onmessage = (e) => {
            if (e.data instanceof ArrayBuffer && audioCtx.state === 'running') {
              const floatArray = new Float32Array(e.data);
              const numFrames = floatArray.length / 2;
              if (numFrames > 0) {
                const buffer = audioCtx.createBuffer(2, numFrames, 48000);
                const left = buffer.getChannelData(0);
                const right = buffer.getChannelData(1);

                for (let i = 0; i < numFrames; i++) {
                  left[i] = floatArray[i * 2];
                  right[i] = floatArray[i * 2 + 1];
                }

                const source = audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(gameGain);
                source.start();
              }
            }
          };

          hasAudioTracks = true;
        } else if (displayStream.getAudioTracks().length > 0) {
          // Standard system loopback
          const gameTrack = displayStream.getAudioTracks()[0];
          const gameSource = audioCtx.createMediaStreamSource(new MediaStream([gameTrack]));
          const gameGain = audioCtx.createGain();
          gameGain.gain.value = settings.gameVolume ?? 1.0;
          gameSource.connect(gameGain);
          gameGain.connect(destination);
          gameGainRef.current = gameGain;
          hasAudioTracks = true;
        }
      }

      // 2. Host Microphone Path
      if (settings.enableMic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            },
          });
          const micSource = audioCtx.createMediaStreamSource(micStream);
          const micGain = audioCtx.createGain();
          micGain.gain.value = settings.micVolume ?? 1.0;
          micSource.connect(micGain);
          micGain.connect(destination);
          micGainRef.current = micGain;
          hasAudioTracks = true;
        } catch (micErr) {
          console.warn('Microphone permission denied or unavailable:', micErr);
        }
      }

      if (hasAudioTracks) {
        const mixedAudioTrack = destination.stream.getAudioTracks()[0];
        if (mixedAudioTrack) {
          finalStream = new MediaStream([
            displayStream.getVideoTracks()[0],
            mixedAudioTrack,
          ]);
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

  // Pause / Resume transmission
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
