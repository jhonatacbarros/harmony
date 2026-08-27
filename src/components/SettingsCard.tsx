import { useState, useEffect, type FC } from 'react';
import { Sliders, Volume2, Mic, Lock, Globe, Server, Cpu, Zap, VolumeX, HelpCircle, RefreshCw, Gamepad2 } from 'lucide-react';
import { StreamSettings, StreamStatus, AppProcess } from '../types';
import { DiscordAudioGuide } from './DiscordAudioGuide';

interface SettingsCardProps {
  settings: StreamSettings;
  onChange: (newSettings: StreamSettings) => void;
  status: StreamStatus;
}

// Safe Tauri invoke helper
async function tauriInvoke<T>(cmd: string, args?: any): Promise<T | null> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    }
  } catch (err) {
    console.warn(`Tauri command '${cmd}' could not be executed:`, err);
  }
  return null;
}

export const SettingsCard: FC<SettingsCardProps> = ({
  settings,
  onChange,
  status,
}) => {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [processes, setProcesses] = useState<AppProcess[]>([]);
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(false);
  const isStreaming = status === 'live' || status === 'paused';

  const updateSetting = <K extends keyof StreamSettings>(
    key: K,
    value: StreamSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  const fetchProcesses = async () => {
    setIsLoadingProcesses(true);
    const list = await tauriInvoke<AppProcess[]>('get_running_processes');
    if (list && list.length > 0) {
      setProcesses(list);
    }
    setIsLoadingProcesses(false);
  };

  useEffect(() => {
    fetchProcesses();
  }, []);

  return (
    <div className="rounded-2xl glass-panel p-5 space-y-5 border border-white/[0.08] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-300">
            <Sliders className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Painel de Configuração
          </h2>
        </div>
        <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.04]">
          WEBRTC P2P
        </span>
      </div>

      <div className="space-y-4">
        {/* Process Selection (OBS-style target application capture) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Gamepad2 className="h-3.5 w-3.5 text-zinc-400" />
              Jogo / Aplicativo Alvo
            </label>
            <button
              type="button"
              onClick={fetchProcesses}
              disabled={isLoadingProcesses || isStreaming}
              className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-50"
              title="Atualizar lista de janelas e processos abertos"
            >
              <RefreshCw className={`h-2.5 w-2.5 ${isLoadingProcesses ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>

          <div className="relative">
            <select
              disabled={isStreaming}
              value={settings.targetProcessPid ?? '__system__'}
              onChange={(e) => {
                if (e.target.value === '__system__') {
                  onChange({ ...settings, targetProcessPid: undefined, targetProcessName: undefined });
                  return;
                }
                const pid = Number(e.target.value);
                const proc = processes.find((p) => p.pid === pid);
                onChange({ ...settings, targetProcessPid: pid, targetProcessName: proc?.name });
              }}
              className="w-full rounded-xl glass-input px-3.5 py-2.5 text-xs text-zinc-200 bg-surface-300 border border-white/[0.08] focus:outline-none focus:border-zinc-400 appearance-none cursor-pointer disabled:opacity-50"
            >
              <option value="__system__" className="bg-zinc-900 text-zinc-200">
                🌐 Áudio Geral do Sistema (Padrão)
              </option>
              {processes.map((proc) => (
                <option key={proc.pid} value={proc.pid} className="bg-zinc-900 text-zinc-200">
                  🎮 {proc.display_name} ({proc.name})
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400">
              <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Quality (Segmented Control) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-zinc-400" />
              Resolução de Saída
            </label>
            <span className="text-[10px] text-zinc-500 font-mono">GPU Encoded</span>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-300 border border-white/[0.05]">
            {(['720p', '1080p'] as const).map((q) => {
              const active = settings.quality === q;
              return (
                <button
                  key={q}
                  disabled={isStreaming}
                  onClick={() => updateSetting('quality', q)}
                  className={`relative flex flex-col items-center justify-center py-2 px-3 rounded-lg text-xs transition-all duration-200 ${
                    active
                      ? 'bg-zinc-200 text-zinc-950 font-bold shadow-md'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                  } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="text-xs font-bold">{q}</span>
                  <span className="text-[10px] opacity-75 mt-0.5">
                    {q === '720p' ? '1280x720 • ~4.5 Mbps GPU' : '1920x1080 • ~8.5 Mbps GPU'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Framerate (Segmented Control) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-zinc-400" />
              Taxa de Quadros
            </label>
            <span className="text-[10px] text-zinc-500 font-mono">Framerate Target</span>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-300 border border-white/[0.05]">
            {([30, 60] as const).map((fps) => {
              const active = settings.fps === fps;
              return (
                <button
                  key={fps}
                  disabled={isStreaming}
                  onClick={() => updateSetting('fps', fps)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs transition-all duration-200 ${
                    active
                      ? 'bg-zinc-200 text-zinc-950 font-bold shadow-md'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                  } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="font-bold">{fps} FPS</span>
                  <span className="text-[10px] opacity-75">{fps === 60 ? '⚡ Suave' : '🎬 Padrão'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Audio Toggles & Sliders */}
        <div className="space-y-3 pt-1">
          <label className="text-xs font-medium text-zinc-300 block">
            Canais e Mixagem de Áudio
          </label>

          <div className="grid grid-cols-2 gap-2">
            {/* Som do Jogo */}
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => updateSetting('enableAudio', !settings.enableAudio)}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                settings.enableAudio
                  ? 'border-zinc-500/50 bg-zinc-800/80 text-zinc-100'
                  : 'border-white/[0.06] bg-surface-300/60 text-zinc-500 hover:border-white/10'
              } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-2 text-left">
                <Volume2 className={`h-4 w-4 ${settings.enableAudio ? 'text-zinc-200' : 'text-zinc-600'}`} />
                <div>
                  <div className="text-xs font-semibold">Som do Jogo</div>
                  <div className="text-[10px] text-zinc-500">Canal Principal</div>
                </div>
              </div>
              <div
                className={`w-7 h-4 rounded-full transition-colors relative flex items-center px-0.5 ${
                  settings.enableAudio ? 'bg-zinc-200' : 'bg-zinc-700'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full transition-transform ${
                    settings.enableAudio ? 'bg-zinc-950 translate-x-3' : 'bg-zinc-400 translate-x-0'
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
                  ? 'border-zinc-500/50 bg-zinc-800/80 text-zinc-100'
                  : 'border-white/[0.06] bg-surface-300/60 text-zinc-500 hover:border-white/10'
              } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-2 text-left">
                <Mic className={`h-4 w-4 ${settings.enableMic ? 'text-zinc-200' : 'text-zinc-600'}`} />
                <div>
                  <div className="text-xs font-semibold">Microfone</div>
                  <div className="text-[10px] text-zinc-500">Sua Voz</div>
                </div>
              </div>
              <div
                className={`w-7 h-4 rounded-full transition-colors relative flex items-center px-0.5 ${
                  settings.enableMic ? 'bg-zinc-200' : 'bg-zinc-700'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full transition-transform ${
                    settings.enableMic ? 'bg-zinc-950 translate-x-3' : 'bg-zinc-400 translate-x-0'
                  }`}
                />
              </div>
            </button>
          </div>

          {/* Volume Sliders (Mixer) */}
          {settings.enableAudio && (
            <div className="space-y-2 rounded-xl bg-surface-300/80 p-3 border border-white/[0.05]">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Volume2 className="h-3 w-3 text-zinc-400" />
                    Volume do Jogo
                  </span>
                  <span className="font-mono text-zinc-200">{Math.round((settings.gameVolume ?? 1.0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={settings.gameVolume ?? 1.0}
                  onChange={(e) => updateSetting('gameVolume', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-200"
                />
              </div>

              {settings.enableMic && (
                <div className="space-y-1 pt-1.5 border-t border-white/[0.04]">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400 flex items-center gap-1">
                      <Mic className="h-3 w-3 text-zinc-400" />
                      Volume do Microfone
                    </span>
                    <span className="font-mono text-zinc-200">{Math.round((settings.micVolume ?? 1.0) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={settings.micVolume ?? 1.0}
                    onChange={(e) => updateSetting('micVolume', parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-200"
                  />
                </div>
              )}
            </div>
          )}

          {/* Modo Anti-Eco Discord */}
          <div
            className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
              settings.isolateDiscord
                ? 'border-zinc-500/50 bg-zinc-800/80 text-zinc-100'
                : 'border-white/[0.06] bg-surface-300/40 text-zinc-500'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg ${settings.isolateDiscord ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-800 text-zinc-500'}`}>
                <VolumeX className="h-4 w-4" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white">Modo Anti-Eco Discord</span>
                  <button
                    type="button"
                    onClick={() => setIsGuideOpen(true)}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors p-0.5"
                    title="Ver como funciona e como isolar o áudio do jogo"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="text-[10px] text-zinc-400">
                  Filtro de eco para amigos na call não se ouvirem
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={isStreaming}
              onClick={() => updateSetting('isolateDiscord', !settings.isolateDiscord)}
              className={`w-8 h-4.5 rounded-full transition-colors relative flex items-center px-0.5 ${
                settings.isolateDiscord ? 'bg-zinc-200' : 'bg-zinc-700'
              } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full transition-transform ${
                  settings.isolateDiscord ? 'bg-zinc-950 translate-x-3.5' : 'bg-zinc-400 translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <DiscordAudioGuide
          isOpen={isGuideOpen}
          onClose={() => setIsGuideOpen(false)}
        />

        {/* Network & Security Inputs */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <div>
            <label className="text-[11px] font-medium text-zinc-400 mb-1 flex items-center gap-1.5">
              <Server className="h-3 w-3 text-zinc-400" />
              Porta Local
            </label>
            <input
              type="number"
              disabled={isStreaming}
              value={settings.port}
              onChange={(e) => updateSetting('port', parseInt(e.target.value) || 8080)}
              className="w-full rounded-xl glass-input px-3 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none disabled:opacity-50"
              placeholder="8080"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-400 mb-1 flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-zinc-400" />
              PIN de Acesso
            </label>
            <input
              type="text"
              disabled={isStreaming}
              value={settings.pin}
              onChange={(e) => updateSetting('pin', e.target.value)}
              maxLength={12}
              className="w-full rounded-xl glass-input px-3 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none disabled:opacity-50"
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
              ? 'border-zinc-500/50 bg-zinc-800/80 text-zinc-100'
              : 'border-white/[0.06] bg-surface-300/40 text-zinc-500'
          } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${settings.enableCloudflare ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-800 text-zinc-600'}`}>
              <Globe className="h-4 w-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold text-white">Cloudflare Quick Tunnel</div>
              <div className="text-[10px] text-zinc-400">Gera link web público para amigos</div>
            </div>
          </div>

          <div
            className={`w-8 h-4.5 rounded-full transition-colors relative flex items-center px-0.5 ${
              settings.enableCloudflare ? 'bg-zinc-200' : 'bg-zinc-700'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full transition-transform ${
                settings.enableCloudflare ? 'bg-zinc-950 translate-x-3.5' : 'bg-zinc-400 translate-x-0'
              }`}
            />
          </div>
        </button>
      </div>
    </div>
  );
};
