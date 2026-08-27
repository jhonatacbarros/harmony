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

// Tauri invoke helper that rejects on backend error instead of swallowing it
async function tauriInvokeStrict<T>(cmd: string, args?: any): Promise<T> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    throw new Error('Captura de áudio por processo requer o aplicativo desktop Harmony.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<T>(cmd, args);
}

// Optimize codec preference prioritizing H.264 GPU Hardware Acceleration
function optimizeCodecs(pc: RTCPeerConnection) {
  try {
    const transceivers = pc.getTransceivers();
    for (const transceiver of transceivers) {
      if (transceiver.sender.track?.kind === 'video' && 'setCodecPreferences' in transceiver) {
        const capabilities = RTCRtpSender.getCapabilities('video');
        if (capabilities) {
          const h264Codecs = capabilities.codecs.filter(
            (c) => c.mimeType.toLowerCase() === 'video/h264'
          );
          const otherCodecs = capabilities.codecs.filter(
            (c) => c.mimeType.toLowerCase() !== 'video/h264'
          );
          // Put H.264 (NVENC/AMD/Intel hardware) at the top of SDP
          if (h264Codecs.length > 0) {
            transceiver.setCodecPreferences([...h264Codecs, ...otherCodecs]);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not set codec preferences:', err);
  }
}

// Configure max bitrate and maintain-framerate priority on video senders
async function tuneSenderParameters(pc: RTCPeerConnection, targetBitrate: number) {
  try {
    const senders = pc.getSenders();
    for (const sender of senders) {
      if (sender.track?.kind === 'video') {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = targetBitrate;
        params.encodings[0].maxFramerate = 60;
        params.encodings[0].scaleResolutionDownBy = 1.0;
        // Priority for fluid framerate
        // @ts-ignore
        params.degradationPreference = 'maintain-framerate';
        await sender.setParameters(params);
      }
    }
  } catch (err) {
    console.warn('Could not set sender parameters:', err);
  }
}

// Inject high-bandwidth bitrate limits into SDP
function boostSdpBitrate(sdp: string, bitrateKbps: number): string {
  let modified = sdp.replace(
    /(m=video .*\r\n)/g,
    `$1b=AS:${bitrateKbps}\r\nb=TIAS:${bitrateKbps * 1000}\r\n`
  );
  // Inject Google specific start/max bitrate parameters
  modified = modified.replace(
    /a=fmtp:(\d+) (.*)/g,
    `a=fmtp:$1 $2;x-google-min-bitrate=${Math.floor(bitrateKbps * 0.5)};x-google-max-bitrate=${bitrateKbps};x-google-start-bitrate=${Math.floor(bitrateKbps * 0.8)}`
  );
  return modified;
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

  // Target Bitrate: 8.5 Mbps for 1080p 60fps, 4.5 Mbps for 720p 60fps
  const targetBitrateBps = settings.quality === '1080p' ? 8_500_000 : 4_500_000;
  const targetBitrateKbps = Math.floor(targetBitrateBps / 1000);

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

  // Handle incoming viewer connection with hardware acceleration & bitrate boosts
  const handleViewerOffer = useCallback(async (viewerId: string, offer: RTCSessionDescriptionInit) => {
    if (!streamRef.current) return;

    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peersRef.current.set(viewerId, pc);

      // 1. Add all tracks from the captured screen/audio stream
      streamRef.current.getTracks().forEach((track) => {
        if (streamRef.current) {
          pc.addTrack(track, streamRef.current);
        }
      });

      // 2. Set H.264 GPU Hardware Acceleration as preferred video codec
      optimizeCodecs(pc);

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

      // 3. Inject High-Performance Bitrate into SDP
      const boostedSdp = boostSdpBitrate(answer.sdp || '', targetBitrateKbps);
      const boostedAnswer = { type: answer.type, sdp: boostedSdp };
      await pc.setLocalDescription(boostedAnswer);

      // 4. Tune sender parameters for 60 FPS lock & bitrate
      await tuneSenderParameters(pc, targetBitrateBps);

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'answer',
            senderId: 'host',
            targetId: viewerId,
            payload: boostedAnswer,
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
  }, [targetBitrateBps, targetBitrateKbps]);

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

      // Use browser/system audio by default. The native process path is only
      // selected when the user explicitly chooses a target process.
      const shouldUseNativeProcessAudio = typeof settings.targetProcessPid === 'number';

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: width, max: width },
          height: { ideal: height, max: height },
          frameRate: { ideal: settings.fps, max: settings.fps },
          // @ts-ignore
          cursor: 'always',
        },
        audio: shouldUseNativeProcessAudio ? false : settings.enableAudio,
      });

      // Optimize video track for fast-motion games (locks 60 FPS)
      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        // @ts-ignore
        videoTrack.contentHint = 'motion';
        videoTrack.onended = () => {
          stopStream();
        };
      }

      let finalStream = displayStream;

      // Build WebAudio Mixing Graph
      const audioCtx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      const destination = audioCtx.createMediaStreamDestination();

      let hasAudioTracks = false;

      // 1. Process/Game Audio Path
      if (settings.enableAudio) {
        if (shouldUseNativeProcessAudio) {
          // Trigger Rust native Process Loopback (WASAPI) capture for the target process
          await tauriInvokeStrict('start_native_audio_capture', {
            targetPid: settings.targetProcessPid,
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
            videoTrack,
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
