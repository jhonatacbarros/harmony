import type { FC } from 'react';
import { Sliders, Volume2, Mic, Lock, Globe, Server, Cpu, Zap } from 'lucide-react';
import { StreamSettings, StreamStatus } from '../types';

interface SettingsCardProps {
  settings: StreamSettings;
  onChange: (newSettings: StreamSettings) => void;
  status: StreamStatus;
}

export const SettingsCard: FC<SettingsCardProps> = ({
  settings,
  onChange,
  status,
}) => {
  const isStreaming = status === 'live' || status === 'paused';

  const updateSetting = <K extends keyof StreamSettings>(
    key: K,
    value: StreamSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="rounded-2xl glass-panel p-5 space-y-5 border border-white/[0.08] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Sliders className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Painel de Configuração
          </h2>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.04]">
          WEBRTC P2P
        </span>
      </div>

      <div className="space-y-4">
        {/* Quality (Segmented Control) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-indigo-400" />
              Resolução de Saída
            </label>
            <span className="text-[10px] text-slate-500">Auto GPU Encoding</span>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-300/80 border border-white/[0.05]">
            {(['720p', '1080p'] as const).map((q) => {
              const active = settings.quality === q;
              return (
                <button
                  key={q}
                  disabled={isStreaming}
                  onClick={() => updateSetting('quality', q)}
                  className={`relative flex flex-col items-center justify-center py-2.5 px-3 rounded-lg text-xs transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-tr from-indigo-600/90 to-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                  } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="text-xs font-bold">{q}</span>
                  <span className="text-[10px] opacity-75 mt-0.5">
                    {q === '720p' ? '1280x720 • ~3 Mbps' : '1920x1080 • ~7 Mbps'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Framerate (Segmented Control) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-cyan-400" />
              Taxa de Quadros
            </label>
            <span className="text-[10px] text-slate-500">Framerate Target</span>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-300/80 border border-white/[0.05]">
            {([30, 60] as const).map((fps) => {
              const active = settings.fps === fps;
              return (
                <button
                  key={fps}
                  disabled={isStreaming}
                  onClick={() => updateSetting('fps', fps)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-tr from-cyan-600/90 to-cyan-500 text-white font-semibold shadow-lg shadow-cyan-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                  } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="font-bold">{fps} FPS</span>
                  <span className="text-[10px] opacity-75">{fps === 60 ? '⚡ Suave' : '🎬 Padrão'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Audio Toggles (Tactile Switch Cards) */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-medium text-slate-300 block">
            Canais de Áudio
          </label>

          <div className="grid grid-cols-2 gap-2">
            {/* Som do Jogo */}
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => updateSetting('enableAudio', !settings.enableAudio)}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                settings.enableAudio
                  ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                  : 'border-white/[0.06] bg-surface-300/50 text-slate-500 hover:border-white/10'
              } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-2 text-left">
                <Volume2 className={`h-4 w-4 ${settings.enableAudio ? 'text-indigo-400' : 'text-slate-600'}`} />
                <div>
                  <div className="text-xs font-semibold">Som do Jogo</div>
                  <div className="text-[10px] text-slate-500">Áudio do Sistema</div>
                </div>
              </div>
              <div
                className={`w-7 h-4 rounded-full transition-colors relative flex items-center px-0.5 ${
                  settings.enableAudio ? 'bg-indigo-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.enableAudio ? 'translate-x-3' : 'translate-x-0'
                  }`}
                />
              </div>
            </button>

            {/* Microfone */}
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => updateSetting('enableMic', !settings.enableMic)}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                settings.enableMic
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                  : 'border-white/[0.06] bg-surface-300/50 text-slate-500 hover:border-white/10'
              } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-2 text-left">
                <Mic className={`h-4 w-4 ${settings.enableMic ? 'text-cyan-400' : 'text-slate-600'}`} />
                <div>
                  <div className="text-xs font-semibold">Microfone</div>
                  <div className="text-[10px] text-slate-500">Sua Voz</div>
                </div>
              </div>
              <div
                className={`w-7 h-4 rounded-full transition-colors relative flex items-center px-0.5 ${
                  settings.enableMic ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.enableMic ? 'translate-x-3' : 'translate-x-0'
                  }`}
                />
              </div>
            </button>
          </div>
        </div>

        {/* Network & Security Inputs */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <div>
            <label className="text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1.5">
              <Server className="h-3 w-3 text-indigo-400" />
              Porta Local
            </label>
            <input
              type="number"
              disabled={isStreaming}
              value={settings.port}
              onChange={(e) => updateSetting('port', parseInt(e.target.value) || 8080)}
              className="w-full rounded-xl glass-input px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none disabled:opacity-50"
              placeholder="8080"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-amber-400" />
              PIN de Acesso
            </label>
            <input
              type="text"
              disabled={isStreaming}
              value={settings.pin}
              onChange={(e) => updateSetting('pin', e.target.value)}
              maxLength={12}
              className="w-full rounded-xl glass-input px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none disabled:opacity-50"
              placeholder="Opcional"
            />
          </div>
        </div>

        {/* Cloudflare Tunnel Toggle Card */}
        <button
          type="button"
          disabled={isStreaming}
          onClick={() => updateSetting('enableCloudflare', !settings.enableCloudflare)}
          className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
            settings.enableCloudflare
              ? 'border-indigo-500/40 bg-gradient-to-r from-indigo-500/10 to-violet-500/10 text-indigo-200'
              : 'border-white/[0.06] bg-surface-300/50 text-slate-500'
          } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${settings.enableCloudflare ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-600'}`}>
              <Globe className="h-4 w-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold text-white">Cloudflare Quick Tunnel</div>
              <div className="text-[10px] text-slate-400">Gera link web público para amigos</div>
            </div>
          </div>

          <div
            className={`w-8 h-4.5 rounded-full transition-colors relative flex items-center px-0.5 ${
              settings.enableCloudflare ? 'bg-indigo-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                settings.enableCloudflare ? 'translate-x-3.5' : 'translate-x-0'
              }`}
            />
          </div>
        </button>
      </div>
    </div>
  );
};
