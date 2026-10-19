import { useState, useRef, useCallback, useEffect } from 'react';
import { StreamSettings, StreamStatus, SessionInfo, PeerStats, ContentMode, resolveBitrateMbps } from '../types';

import { tuneRemoteOffer } from '../sdp';

const STATS_INTERVAL_MS = 2000;
const START_BITRATE_KBPS = 1200;

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

// Bitrate ceiling + fps cap. No floor: congestion control must be free to go
// below 1 Mbps on a bad link. The mode decides what gives first under pressure.
async function tuneSenderParameters(pc: RTCPeerConnection, targetBitrate: number, fps: number, mode: ContentMode) {
  try {
    const senders = pc.getSenders();
    for (const sender of senders) {
      if (sender.track?.kind === 'video') {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = targetBitrate;
        params.encodings[0].maxFramerate = fps;
        params.encodings[0].scaleResolutionDownBy = 1.0;
        // @ts-ignore
        params.degradationPreference = mode === 'motion' ? 'maintain-framerate' : 'maintain-resolution';
        await sender.setParameters(params);
      }
    }
  } catch (err) {
    console.warn('Could not set sender parameters:', err);
  }
}

type StatsSample = { bytesSent: number; timestamp: number };

async function collectPeerStats(pc: RTCPeerConnection, prev?: StatsSample): Promise<[PeerStats, StatsSample | undefined]> {
  const report = await pc.getStats();
  const out: PeerStats = {};
  let sample: StatsSample | undefined;
  let pairId: string | undefined;

  report.forEach((s: any) => {
    if (s.type === 'outbound-rtp' && s.kind === 'video') {
      out.width = s.frameWidth;
      out.height = s.frameHeight;
      out.fps = s.framesPerSecond;
      out.limitation = s.qualityLimitationReason;
      out.encoder = s.encoderImplementation;
      out.hardwareEncoder = s.powerEfficientEncoder;
      sample = { bytesSent: s.bytesSent, timestamp: s.timestamp };
      if (prev && s.timestamp > prev.timestamp) {
        out.sendKbps = Math.round(((s.bytesSent - prev.bytesSent) * 8) / (s.timestamp - prev.timestamp));
      }
    } else if (s.type === 'transport' && s.selectedCandidatePairId) {
      pairId = s.selectedCandidatePairId;
    }
  });

  const pair: any = pairId ? report.get(pairId) : undefined;
  if (pair) {
    if (pair.availableOutgoingBitrate) out.availableKbps = Math.round(pair.availableOutgoingBitrate / 1000);
    if (pair.currentRoundTripTime !== undefined) out.rttMs = Math.round(pair.currentRoundTripTime * 1000);
    // Relayed if either side goes through TURN
    const local = report.get(pair.localCandidateId)?.candidateType;
    const remote = report.get(pair.remoteCandidateId)?.candidateType;
    out.route = local === 'relay' || remote === 'relay' ? 'relay' : local;
  }

  return [out, sample];
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
  const [peerStats, setPeerStats] = useState<Record<string, PeerStats>>({});
  const statsSamplesRef = useRef<Map<string, StatsSample>>(new Map());

  // Audio Graph Nodes for real-time volume mixing
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gameGainRef = useRef<GainNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);

  const targetBitrateBps = Math.round(resolveBitrateMbps(settings) * 1_000_000);
  const contentMode: ContentMode = settings.contentMode ?? 'motion';
  // Read via ref: the signaling socket handler outlives renders, and mode can change live
  const contentModeRef = useRef(contentMode);
  contentModeRef.current = contentMode;

  // Apply content mode live to the track and every connected viewer (no renegotiation)
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) track.contentHint = contentMode;
    peersRef.current.forEach((pc) => tuneSenderParameters(pc, targetBitrateBps, settings.fps, contentMode));
  }, [contentMode]);

  // Per-viewer link telemetry, like Moonlight's stats overlay
  useEffect(() => {
    if (status !== 'live' && status !== 'paused') return;
    const timer = setInterval(async () => {
      const next: Record<string, PeerStats> = {};
      for (const [id, pc] of peersRef.current) {
        try {
          const [stats, sample] = await collectPeerStats(pc, statsSamplesRef.current.get(id));
          if (sample) statsSamplesRef.current.set(id, sample);
          next[id] = stats;
        } catch {
          // peer closed mid-poll
        }
      }
      setPeerStats(next);
    }, STATS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status]);

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

    statsSamplesRef.current.clear();
    setPeerStats({});
    setStream(null);
    setViewerCount(0);
    setStatus('idle');
  }, []);

  // Handle incoming viewer connection with hardware acceleration & bitrate boosts
  // iceServers: per-viewer STUN/TURN credentials the server attaches to the offer
  const handleViewerOffer = useCallback(async (viewerId: string, offer: RTCSessionDescriptionInit, iceServers: RTCIceServer[] = []) => {
    if (!streamRef.current) return;

    try {
      const pc = new RTCPeerConnection({ iceServers });
      peersRef.current.set(viewerId, pc);

      // 1. Add all tracks from the captured screen/audio stream
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

      // 2. Codec order, Opus params and start bitrate live in the remote offer (see sdp.ts)
      const startKbps = Math.min(START_BITRATE_KBPS, Math.round(targetBitrateBps / 1000));
      await pc.setRemoteDescription({
        type: offer.type,
        sdp: tuneRemoteOffer(offer.sdp || '', settings.codecPreference ?? 'h264', startKbps),
      });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // 3. Bitrate ceiling, fps cap and degradation mode
      await tuneSenderParameters(pc, targetBitrateBps, settings.fps, contentModeRef.current);

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
        // 'disconnected' is transient (ICE may recover), so only drop on failed/closed
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          pc.close();
          peersRef.current.delete(viewerId);
          statsSamplesRef.current.delete(viewerId);
          setViewerCount(peersRef.current.size);
        }
      };
    } catch (err) {
      console.error(`Error handling offer from viewer ${viewerId}:`, err);
    }
  }, [targetBitrateBps, settings.fps, settings.codecPreference]);

  // Connect to the local signaling server
  const connectSignaling = useCallback((port: number, pin: string, token: string) => {
    const ws = new WebSocket(
      `ws://localhost:${port}/ws/host?token=${encodeURIComponent(token)}&pin=${encodeURIComponent(pin)}`
    );
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('Host connected to signaling server');
      setStatus('live');
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'offer' && msg.senderId && msg.payload) {
          await handleViewerOffer(msg.senderId, msg.payload, msg.iceServers);
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
  const startStream = useCallback(async (session: SessionInfo) => {
    try {
      setErrorMessage(null);
      setStatus('starting');

      const width = settings.quality === '1080p' ? 1920 : 1280;
      const height = settings.quality === '1080p' ? 1080 : 720;

      // Use browser/system audio by default. The native process path is only
      // selected when the user explicitly chooses a target process.
      const shouldUseNativeProcessAudio = typeof settings.targetProcessPid === 'number';

      // Capture screen with uncompressed stereo audio settings (no echo/noise suppression on game sound)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: width, max: width },
          height: { ideal: height, max: height },
          frameRate: { ideal: settings.fps, max: settings.fps },
          // @ts-ignore
          cursor: 'always',
        },
        audio: shouldUseNativeProcessAudio
          ? false
          : settings.enableAudio
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 2,
              sampleRate: 48000,
            }
          : false,
      });

      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = contentModeRef.current;
        videoTrack.onended = () => {
          stopStream();
        };
      }

      let finalStream = displayStream;

      // Build WebAudio Mixing Graph (48kHz stereo studio pipeline)
      const audioCtx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      const destination = audioCtx.createMediaStreamDestination();

      // Master Limiter to prevent clipping / distortion when mixing loud game audio & mic
      const limiter = audioCtx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-1.0, audioCtx.currentTime); // -1 dBFS ceiling
      limiter.knee.setValueAtTime(0.0, audioCtx.currentTime);
      limiter.ratio.setValueAtTime(20.0, audioCtx.currentTime);     // Hard limiting
      limiter.attack.setValueAtTime(0.002, audioCtx.currentTime);   // 2ms fast attack
      limiter.release.setValueAtTime(0.05, audioCtx.currentTime);   // 50ms release
      limiter.connect(destination);

      let hasAudioTracks = false;

      // 1. Process/Game Audio Path
      if (settings.enableAudio) {
        if (shouldUseNativeProcessAudio) {
          // Trigger Rust native Process Loopback (WASAPI) capture for the target process
          await tauriInvokeStrict('start_native_audio_capture', {
            targetPid: settings.targetProcessPid,
          });

          // Connect to internal audio stream socket
          const audioWs = new WebSocket(
            `ws://localhost:${settings.port}/ws/audio_loopback?token=${encodeURIComponent(session.token)}`
          );
          audioSocketRef.current = audioWs;
          audioWs.binaryType = 'arraybuffer';

          const gameGain = audioCtx.createGain();
          gameGain.gain.value = settings.gameVolume ?? 1.0;
          gameGain.connect(limiter);
          gameGainRef.current = gameGain;

          // Continuous playback timeline to eliminate gap/overlap clicks and hissing
          let nextAudioPlayTime = 0;
          const JITTER_BUFFER_SEC = 0.05; // 50ms buffer absorbs thread/socket timing jitter

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

                const currentTime = audioCtx.currentTime;
                // Re-sync if timing has fallen behind (underflow) or drifted too far ahead (>250ms)
                if (nextAudioPlayTime < currentTime || nextAudioPlayTime > currentTime + 0.25) {
                  nextAudioPlayTime = currentTime + JITTER_BUFFER_SEC;
                }

                source.start(nextAudioPlayTime);
                nextAudioPlayTime += buffer.duration;
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
          gameGain.connect(limiter);
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
          micGain.connect(limiter);
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
      connectSignaling(settings.port, settings.pin, session.token);
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
    peerStats,
    errorMessage,
    startStream,
    togglePause,
    stopStream,
  };
}
