import { useState, useEffect, type FC } from 'react';
import { Activity, ShieldCheck, Sparkles, Clock } from 'lucide-react';
import { StreamStatus } from '../types';

interface HeaderProps {
  status: StreamStatus;
  viewerCount: number;
}

export const Header: FC<HeaderProps> = ({ status, viewerCount }) => {
  const [seconds, setSeconds] = useState<number>(0);

  useEffect(() => {
    let interval: any = null;
    if (status === 'live') {
      interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (status === 'idle') {
      setSeconds(0);
    }
    return () => clearInterval(interval);
  }, [status]);

  const formatDuration = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <header className="relative z-20 border-b border-white/[0.06] bg-surface-200/50 backdrop-blur-xl px-6 py-3.5 flex items-center justify-between">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3.5">
        <div className="relative group">
          <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-indigo-500 via-cyan-400 to-violet-500 opacity-60 blur-xs transition duration-500 group-hover:opacity-100"></div>
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-surface-300 border border-white/10 shadow-inner">
            <span className="font-mono text-sm font-extrabold tracking-tight bg-gradient-to-tr from-indigo-300 via-cyan-200 to-white bg-clip-text text-transparent">
              H
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-white font-mono">
              HARMONY
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
              <Sparkles className="h-2.5 w-2.5" />
              STUDIO
            </span>
          </div>
          <p className="text-[11px] text-slate-400/80">Low-Latency Desktop P2P Broadcaster</p>
        </div>
      </div>

      {/* Center / Right Telemetry Status */}
      <div className="flex items-center gap-3">
        {/* Stream Timer */}
        {status === 'live' && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-lg bg-surface-100/70 border border-white/[0.06] px-2.5 py-1 text-xs font-mono text-slate-300">
            <Clock className="h-3.5 w-3.5 text-indigo-400" />
            <span>{formatDuration(seconds)}</span>
          </div>
        )}

        {/* Status Pill */}
        {status === 'live' && (
          <div className="flex items-center gap-2 rounded-full bg-rose-500/10 border border-rose-500/30 px-3.5 py-1 text-xs font-medium text-rose-300 shadow-glow-rose">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span className="tracking-wide uppercase text-[11px] font-bold">AO VIVO</span>
            <span className="h-3 w-px bg-rose-500/30 mx-0.5"></span>
            <span className="text-[11px] text-rose-200/90 font-mono font-normal">
              {viewerCount} {viewerCount === 1 ? 'espectador' : 'espectadores'}
            </span>
          </div>
        )}

        {status === 'paused' && (
          <div className="flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/30 px-3.5 py-1 text-xs font-semibold text-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="tracking-wider uppercase text-[11px]">PAUSADO</span>
          </div>
        )}

        {status === 'idle' && (
          <div className="flex items-center gap-2 rounded-full bg-surface-100/60 border border-white/[0.08] px-3 py-1 text-xs font-medium text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[11px] tracking-wide uppercase">Pronto para Iniciar</span>
          </div>
        )}

        {status === 'starting' && (
          <div className="flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 text-xs font-medium text-indigo-300">
            <Activity className="h-3.5 w-3.5 animate-spin text-indigo-400" />
            <span className="text-[11px]">Iniciando...</span>
          </div>
        )}
      </div>
    </header>
  );
};
