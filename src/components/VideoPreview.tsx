import React, { useEffect, useRef } from 'react';
import { MonitorPlay, PauseCircle } from 'lucide-react';
import { StreamStatus } from '../types';

interface VideoPreviewProps {
  stream: MediaStream | null;
  status: StreamStatus;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({ stream, status }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const isStreaming = status === 'live' || status === 'paused';

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 shadow-2xl flex items-center justify-center">
      {isStreaming && stream ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-contain transition-opacity duration-300 ${
              status === 'paused' ? 'opacity-40 filter grayscale' : 'opacity-100'
            }`}
          />
          {status === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs text-amber-300">
              <PauseCircle className="h-12 w-12 animate-pulse mb-2" />
              <span className="text-sm font-semibold tracking-wide uppercase">
                Transmissão Pausada
              </span>
              <span className="text-xs text-slate-400">
                Os espectadores estão vendo a tela de pausa
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center p-6 text-center text-slate-600">
          <div className="mb-3 rounded-2xl bg-slate-900 p-4 border border-slate-800/80 shadow-inner">
            <MonitorPlay className="h-10 w-10 text-slate-600" />
          </div>
          <p className="text-sm font-medium text-slate-400">Nenhuma transmissão ativa</p>
          <p className="text-xs text-slate-600 max-w-xs mt-1">
            Escolha as configurações e clique em "Iniciar Transmissão de Tela" para selecionar seu jogo ou monitor.
          </p>
        </div>
      )}

      {/* Badge no canto do preview */}
      {isStreaming && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1 text-[11px] font-mono text-slate-300 backdrop-blur-md border border-white/10">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          <span>PREVIEW LOCAL</span>
        </div>
      )}
    </div>
  );
};
