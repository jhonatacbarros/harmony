import { useState, type FC } from 'react';
import { Copy, Check, Globe, Network, Users, Key, Radio, Info } from 'lucide-react';
import { StreamStatus } from '../types';

interface ConnectionInfoProps {
  status: StreamStatus;
  localUrl: string;
  cloudflareUrl: string | null;
  viewerCount: number;
  pin: string;
}

export const ConnectionInfo: FC<ConnectionInfoProps> = ({
  status,
  localUrl,
  cloudflareUrl,
  viewerCount,
  pin,
}) => {
  const [copiedType, setCopiedType] = useState<'local' | 'cf' | null>(null);

  const isStreaming = status === 'live' || status === 'paused';

  const copyToClipboard = (text: string, type: 'local' | 'cf') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  if (!isStreaming) return null;

  return (
    <div className="rounded-2xl glass-panel p-5 space-y-4 border border-indigo-500/20 shadow-glow-brand/20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Links de Transmissão para Amigos
          </h3>
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-surface-300 border border-white/[0.08] px-2.5 py-1 text-xs font-medium text-slate-300">
          <Users className="h-3 w-3 text-indigo-400" />
          <span>{viewerCount} conectados</span>
        </div>
      </div>

      <div className="space-y-3.5">
        {/* Cloudflare Tunnel Link (Internet Public) */}
        {cloudflareUrl ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-emerald-400 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-emerald-400" />
                Link Público da Internet (Cloudflare)
              </span>
              <span className="text-[10px] text-emerald-500/80 font-mono">Disponível Globalmente</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  readOnly
                  value={cloudflareUrl}
                  className="w-full rounded-xl glass-input px-3.5 py-2 text-xs font-mono text-emerald-300 select-all focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(cloudflareUrl, 'cf')}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-glow-emerald hover:from-emerald-500 hover:to-teal-500 transition-all shrink-0 active:scale-95"
              >
                {copiedType === 'cf' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-white" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-xl bg-surface-300/60 p-3 border border-white/[0.05] text-xs text-slate-400">
            <Info className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-slate-300 block">Túnel Cloudflare não ativo</span>
              <span className="text-[11px] text-slate-500 leading-relaxed">
                A transmissão está disponível na sua rede local. Para link global, certifique-se de que o <code className="text-slate-300 font-mono">cloudflared</code> está instalado.
              </span>
            </div>
          </div>
        )}

        {/* Local Network Link */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300 flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5 text-indigo-400" />
              Link da Rede Local (Wi-Fi / LAN)
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Mesmo Roteador</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={localUrl}
              className="w-full rounded-xl glass-input px-3.5 py-2 text-xs font-mono text-slate-300 select-all focus:outline-none"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(localUrl, 'local')}
              className="flex items-center gap-1.5 rounded-xl bg-surface-100 hover:bg-surface-50 border border-white/[0.08] px-4 py-2 text-xs font-semibold text-slate-200 transition-all shrink-0 active:scale-95"
            >
              {copiedType === 'local' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-400" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* PIN Security Badge */}
        {pin && (
          <div className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-2 text-xs text-amber-300">
            <span className="flex items-center gap-1.5 font-medium">
              <Key className="h-3.5 w-3.5 text-amber-400" />
              PIN Ativo: <strong className="font-mono bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 text-white">{pin}</strong>
            </span>
            <span className="text-[10px] text-amber-400/80">Amigos precisarão deste PIN</span>
          </div>
        )}
      </div>
    </div>
  );
};
