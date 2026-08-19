import type { FC } from 'react';
import { Tv, Radio } from 'lucide-react';
import { StreamStatus } from '../types';

interface HeaderProps {
  status: StreamStatus;
  viewerCount: number;
}

export const Header: React.FC<HeaderProps> = ({ status, viewerCount }) => {
  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-6 py-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/20">
          <Tv className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            Harmony
            <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/30">
              v1.0
            </span>
          </h1>
          <p className="text-xs text-slate-400">Transmissor Desktop WebRTC + Cloudflare</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {status === 'live' && (
          <div className="flex items-center gap-2 rounded-full bg-red-500/10 border border-red-500/30 px-3 py-1 text-xs font-medium text-red-400 animate-pulse">
            <Radio className="h-3.5 w-3.5" />
            <span>AO VIVO ({viewerCount} {viewerCount === 1 ? 'espectador' : 'espectadores'})</span>
          </div>
        )}
        {status === 'paused' && (
          <div className="flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-medium text-amber-400">
            <span>⏸️ PAUSADO</span>
          </div>
        )}
        {status === 'idle' && (
          <div className="flex items-center gap-2 rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-medium text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-500"></span>
            <span>PRONTO</span>
          </div>
        )}
      </div>
    </header>
  );
};
