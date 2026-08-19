import type { FC } from 'react';
import { Play, Pause, Square, AlertCircle, Loader2 } from 'lucide-react';
import { StreamStatus } from '../types';

interface StreamControlsProps {
  status: StreamStatus;
  errorMessage: string | null;
  onStart: () => void;
  onPauseToggle: () => void;
  onStop: () => void;
}

export const StreamControls: FC<StreamControlsProps> = ({
  status,
  errorMessage,
  onStart,
  onPauseToggle,
  onStop,
}) => {
  const isStreaming = status === 'live' || status === 'paused';
  const isStarting = status === 'starting';

  return (
    <div className="space-y-3">
      {errorMessage && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-200 shadow-glow-rose/20">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold block text-rose-300">Falha ao iniciar</span>
            <span className="text-rose-200/80 leading-relaxed">{errorMessage}</span>
          </div>
        </div>
      )}

      <div>
        {!isStreaming ? (
          <button
            type="button"
            disabled={isStarting}
            onClick={onStart}
            className="w-full relative group overflow-hidden rounded-xl p-px font-semibold text-white shadow-glow-brand transition-all duration-300 active:scale-[0.99] disabled:opacity-50"
          >
            {/* Ambient radiant border glow */}
            <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-cyan-400 to-violet-500 group-hover:opacity-100 transition-opacity duration-300"></span>

            {/* Inner button surface */}
            <span className="relative flex items-center justify-center gap-2.5 rounded-[11px] bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 px-6 py-3.5 text-sm font-medium transition-all group-hover:bg-opacity-90">
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-200" />
                  <span className="tracking-wide">Iniciando Transmissão de Tela...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white text-white" />
                  <span className="tracking-wide font-semibold">Iniciar Transmissão de Tela</span>
                </>
              )}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-3">
            {/* Pause / Resume Button */}
            <button
              type="button"
              onClick={onPauseToggle}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-xs font-semibold uppercase tracking-wider transition-all duration-200 border shadow-lg ${
                status === 'paused'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 shadow-glow-emerald'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 shadow-amber-500/10'
              }`}
            >
              {status === 'paused' ? (
                <>
                  <Play className="h-4 w-4 fill-emerald-400 text-emerald-400" />
                  <span>Retomar Stream</span>
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span>Pausar Vídeo</span>
                </>
              )}
            </button>

            {/* Stop Button */}
            <button
              type="button"
              onClick={onStop}
              className="flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-rose-300 transition-all duration-200 hover:bg-rose-500/20 shadow-glow-rose active:scale-95"
            >
              <Square className="h-4 w-4 fill-rose-400 text-rose-400" />
              <span>Encerrar</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
