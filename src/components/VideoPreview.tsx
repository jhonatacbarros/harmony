import { useEffect, useRef, useState, type FC } from 'react';
import { MonitorPlay, PauseCircle, Volume2, VolumeX, Maximize2, Radio } from 'lucide-react';
import { StreamStatus } from '../types';

interface VideoPreviewProps {
  stream: MediaStream | null;
  status: StreamStatus;
  quality: string;
  fps: number;
}

export const VideoPreview: FC<VideoPreviewProps> = ({
  stream,
  status,
  quality,
  fps,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const isStreaming = status === 'live' || status === 'paused';

  const handleToggleFullscreen = () => {
    if (videoRef.current) {
      if (!document.fullscreenElement) {
        videoRef.current.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  return (
    <div className="relative group aspect-video w-full overflow-hidden rounded-2xl glass-panel shadow-2xl flex items-center justify-center border border-white/[0.08]">
      {/* Background ambient glow inside preview box */}
      <div className="absolute inset-0 bg-radial from-indigo-500/5 via-transparent to-black/80 pointer-events-none"></div>

      {isStreaming && stream ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isMuted}
            className={`h-full w-full object-contain transition-all duration-500 ${
              status === 'paused' ? 'opacity-30 filter grayscale blur-xs scale-[0.99]' : 'opacity-100 scale-100'
            }`}
          />

          {/* Viewfinder Corners (Studio HUD) */}
          <div className="absolute inset-4 pointer-events-none border border-white/[0.04] rounded-lg">
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-indigo-400/60"></div>
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-indigo-400/60"></div>
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-indigo-400/60"></div>
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-indigo-400/60"></div>
          </div>

          {/* Overlay: Paused Mode */}
          {status === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm text-amber-300">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 shadow-2xl mb-2 animate-bounce">
                <PauseCircle className="h-8 w-8 text-amber-400" />
              </div>
              <span className="text-xs font-bold tracking-widest uppercase">
                Transmissão em Pausa
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5">
                Os espectadores estão aguardando o retorno
              </span>
            </div>
          )}

          {/* Top Left Telemetry Chips */}
          <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
            <div className="flex items-center gap-1.5 rounded-lg bg-black/60 border border-white/10 px-2.5 py-1 text-[11px] font-mono text-slate-200 backdrop-blur-md">
              <Radio className="h-3 w-3 text-rose-400 animate-pulse" />
              <span>{quality}</span>
              <span className="text-white/40">/</span>
              <span>{fps} FPS</span>
            </div>

            {/* Audio Equalizer Visualizer */}
            {status === 'live' && (
              <div className="flex items-end gap-0.5 h-4 px-2 py-0.5 rounded-lg bg-black/60 border border-white/10 backdrop-blur-md">
                <div className="w-1 bg-indigo-400 rounded-xs eq-bar-1"></div>
                <div className="w-1 bg-cyan-400 rounded-xs eq-bar-2"></div>
                <div className="w-1 bg-indigo-300 rounded-xs eq-bar-3"></div>
                <div className="w-1 bg-emerald-400 rounded-xs eq-bar-4"></div>
                <div className="w-1 bg-violet-400 rounded-xs eq-bar-5"></div>
              </div>
            )}
          </div>

          {/* Bottom Right Floating Preview Actions */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 rounded-xl bg-black/70 hover:bg-black/90 text-white border border-white/10 backdrop-blur-md transition-all active:scale-95"
              title={isMuted ? 'Ouvir Som Localmente' : 'Silenciar Preview Local'}
            >
              {isMuted ? <VolumeX className="h-3.5 w-3.5 text-slate-400" /> : <Volume2 className="h-3.5 w-3.5 text-indigo-400" />}
            </button>
            <button
              onClick={handleToggleFullscreen}
              className="p-2 rounded-xl bg-black/70 hover:bg-black/90 text-white border border-white/10 backdrop-blur-md transition-all active:scale-95"
              title="Tela Cheia"
            >
              <Maximize2 className="h-3.5 w-3.5 text-slate-300" />
            </button>
          </div>
        </>
      ) : (
        /* Idle Empty State */
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="relative mb-4">
            <div className="absolute -inset-2 rounded-2xl bg-indigo-500/20 blur-md"></div>
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-100 border border-white/10 shadow-inner">
              <MonitorPlay className="h-7 w-7 text-indigo-400" />
            </div>
          </div>
          <h3 className="text-sm font-semibold text-white tracking-tight">
            Nenhuma Captura Ativa
          </h3>
          <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
            Personalize as configurações ao lado e clique em Iniciar para selecionar seu jogo ou monitor.
          </p>
        </div>
      )}
    </div>
  );
};
