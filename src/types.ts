import type { CodecPreference } from './sdp';

export type StreamQuality = '720p' | '1080p';
export type FrameRate = 30 | 60;

export interface AppProcess {
  pid: number;
  name: string;
  display_name: string;
}

export interface StreamSettings {
  quality: StreamQuality;
  fps: FrameRate;
  enableAudio: boolean;
  enableMic: boolean;
  isolateDiscord: boolean;
  targetProcessPid?: number;
  targetProcessName?: string;
  gameVolume: number; // 0.0 to 1.0
  micVolume: number;  // 0.0 to 1.0
  port: number;
  pin: string;
  enableCloudflare: boolean;
  videoBitrateMbps?: number; // 3 to 15 Mbps ceiling; undefined = auto
  codecPreference?: CodecPreference;
  contentMode?: ContentMode;
}

// motion: games/video (keep fps, drop resolution); detail: desktop/text (the inverse)
export type ContentMode = 'motion' | 'detail';

// Internet-sized ceilings (Moonlight's LAN table is ~2x this). Congestion control
// still adapts below the ceiling.
export function autoBitrateMbps(quality: StreamQuality, fps: FrameRate): number {
  if (quality === '1080p') return fps === 60 ? 10 : 6;
  return fps === 60 ? 5 : 3;
}

export function resolveBitrateMbps(settings: StreamSettings): number {
  return settings.videoBitrateMbps ?? autoBitrateMbps(settings.quality, settings.fps);
}

export interface SessionInfo {
  token: string;
}

export interface PeerStats {
  width?: number;
  height?: number;
  fps?: number;
  sendKbps?: number;
  availableKbps?: number;
  rttMs?: number;
  limitation?: string; // qualityLimitationReason: none | bandwidth | cpu | other
  encoder?: string;
  hardwareEncoder?: boolean;
  route?: string; // local candidate type: host | srflx | prflx | relay
}

export type StreamStatus = 'idle' | 'starting' | 'live' | 'paused' | 'error';

export interface ViewerInfo {
  id: string;
  connectedAt: Date;
  ip?: string;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'candidate' | 'auth' | 'status' | 'ping';
  senderId: string;
  targetId?: string;
  payload?: any;
  pin?: string;
}
