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
