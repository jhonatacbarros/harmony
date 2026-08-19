import React from 'react';
import { Settings, Volume2, Mic, Lock, Globe, HardDrive } from 'lucide-react';
import { StreamSettings, StreamStatus } from '../types';

interface SettingsCardProps {
  settings: StreamSettings;
  onChange: (newSettings: StreamSettings) => void;
  status: StreamStatus;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({
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
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-sm shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
        <Settings className="h-4 w-4 text-indigo-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          Configurações da Transmissão
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Resolução & FPS */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">
              Resolução de Vídeo
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['720p', '1080p'] as const).map((q) => (
                <button
                  key={q}
                  disabled={isStreaming}
                  onClick={() => updateSetting('quality', q)}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    settings.quality === q
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 shadow-md shadow-indigo-500/10'
                      : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                  } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="text-sm font-bold">{q}</span>
                  <span className="text-[10px] opacity-75">
                    {q === '720p' ? '1280x720 (Leve)' : '1920x1080 (HD)'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">
              Taxa de Quadros (FPS)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([30, 60] as const).map((fps) => (
                <button
                  key={fps}
                  disabled={isStreaming}
                  onClick={() => updateSetting('fps', fps)}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-semibold transition-all ${
                    settings.fps === fps
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 shadow-md shadow-indigo-500/10'
                      : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                  } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span>{fps} FPS</span>
                  <span className="text-[10px] opacity-75">{fps === 60 ? '⚡ Ultra Fluido' : '🎬 Padrão'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Áudio & Segurança & Rede */}
        <div className="space-y-3">
          {/* Toggles de Áudio */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">
              Fontes de Áudio
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={isStreaming}
                onClick={() => updateSetting('enableAudio', !settings.enableAudio)}
                className={`flex items-center justify-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all ${
                  settings.enableAudio
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-800/40 text-slate-500'
                } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>Som do Jogo</span>
              </button>

              <button
                disabled={isStreaming}
                onClick={() => updateSetting('enableMic', !settings.enableMic)}
                className={`flex items-center justify-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all ${
                  settings.enableMic
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-800/40 text-slate-500'
                } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Mic className="h-3.5 w-3.5" />
                <span>Microfone</span>
              </button>
            </div>
          </div>

          {/* Porta Local & PIN */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                <HardDrive className="h-3 w-3 text-slate-500" />
                Porta Local
              </label>
              <input
                type="number"
                disabled={isStreaming}
                value={settings.port}
                onChange={(e) => updateSetting('port', parseInt(e.target.value) || 8080)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                placeholder="8080"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Lock className="h-3 w-3 text-slate-500" />
                PIN / Senha (Opcional)
              </label>
              <input
                type="text"
                disabled={isStreaming}
                value={settings.pin}
                onChange={(e) => updateSetting('pin', e.target.value)}
                maxLength={12}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                placeholder="Ex: 1234"
              />
            </div>
          </div>

          {/* Cloudflare Tunnel Toggle */}
          <div className="pt-1">
            <button
              disabled={isStreaming}
              onClick={() => updateSetting('enableCloudflare', !settings.enableCloudflare)}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition-all ${
                settings.enableCloudflare
                  ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                  : 'border-slate-800 bg-slate-800/40 text-slate-500'
              } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-indigo-400" />
                <span>Ativar Cloudflare Quick Tunnel</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  settings.enableCloudflare ? 'bg-indigo-500/30 text-indigo-200' : 'bg-slate-800 text-slate-500'
                }`}
              >
                {settings.enableCloudflare ? 'Ativado (Link Web)' : 'Desativado (Apenas Local)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
