import React, { useState } from 'react';
import { Copy, Check, Globe, Network, Users, Key } from 'lucide-react';
import { StreamStatus } from '../types';

interface ConnectionInfoProps {
  status: StreamStatus;
  localUrl: string;
  cloudflareUrl: string | null;
  viewerCount: number;
  pin: string;
}

export const ConnectionInfo: React.FC<ConnectionInfoProps> = ({
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
    <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-5 backdrop-blur-sm shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
          <Network className="h-4 w-4 text-indigo-400" />
          Links de Transmissão para Amigos
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-indigo-300 font-medium">
          <Users className="h-3.5 w-3.5" />
          <span>{viewerCount} online</span>
        </div>
      </div>

      <div className="space-y-3">
        {/* Cloudflare Tunnel Link */}
        {cloudflareUrl ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-emerald-400 flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" />
                Link Público da Internet (Cloudflare)
              </span>
              <span className="text-[10px] text-slate-400">Qualquer pessoa pode abrir</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={cloudflareUrl}
                className="w-full rounded-xl border border-emerald-500/40 bg-slate-950 px-3 py-2 text-xs font-mono text-emerald-300 select-all focus:outline-none"
              />
              <button
                onClick={() => copyToClipboard(cloudflareUrl, 'cf')}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-500 transition-all shrink-0"
              >
                {copiedType === 'cf' ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-slate-500" />
              Cloudflare Tunnel não ativado
            </span>
            <span className="text-[10px] text-slate-500">Apenas rede local disponível</span>
          </div>
        )}

        {/* Local Network Link */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300 flex items-center gap-1">
              <Network className="h-3.5 w-3.5 text-indigo-400" />
              Link da Rede Local (Wi-Fi / LAN)
            </span>
            <span className="text-[10px] text-slate-500">Apenas mesma rede</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={localUrl}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-300 select-all focus:outline-none"
            />
            <button
              onClick={() => copyToClipboard(localUrl, 'local')}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-all shrink-0"
            >
              {copiedType === 'local' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* PIN indicator */}
        {pin && (
          <div className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-300">
            <span className="flex items-center gap-1.5 font-medium">
              <Key className="h-3.5 w-3.5 text-amber-400" />
              PIN de Proteção Ativo: <strong className="font-mono bg-amber-500/20 px-1.5 py-0.5 rounded">{pin}</strong>
            </span>
            <span className="text-[10px] text-amber-400/80">Seus amigos precisarão digitar este PIN</span>
          </div>
        )}
      </div>
    </div>
  );
};
