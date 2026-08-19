import React from 'react';
import { Play, Pause, Square, AlertCircle, Loader2 } from 'lucide-react';
import { StreamStatus } from '../types';

interface StreamControlsProps {
  status: StreamStatus;
  errorMessage: string | null;
  onStart: () => void;
  onPauseToggle: () => void;
  onStop: () => void;
}

export const StreamControls: React.FC<StreamControlsProps> = ({
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
        <div className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        {!isStreaming ? (
          <button
            disabled={isStarting}
            onClick={onStart}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:from-indigo-500 hover:to-violet-500 hover:shadow-indigo-600/40 active:scale-[0.99] disabled:opacity-50"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Iniciando Transmissão...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-white" />
                <span>Iniciar Transmissão de Tela</span>
              </>
            )}
          </button>
        ) : (
          <>
            <button
              onClick={onPauseToggle}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-3.5 text-sm font-semibold transition-all shadow-lg ${
                status === 'paused'
                  ? 'border-emerald-500/40 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                  : 'border-amber-500/40 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30'
              }`}
            >
              {status === 'paused' ? (
                <>
                  <Play className="h-4 w-4 fill-emerald-400 text-emerald-400" />
                  <span>Retomar Transmissão</span>
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span>Pausar Transmissão</span>
                </>
              )}
            </button>

            <button
              onClick={onStop}
              className="flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-600/20 px-6 py-3.5 text-sm font-semibold text-red-300 transition-all hover:bg-red-600/30 shadow-lg shadow-red-500/10"
            >
              <Square className="h-4 w-4 fill-red-400 text-red-400" />
              <span>Parar</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
