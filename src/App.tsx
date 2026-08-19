import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { VideoPreview } from './components/VideoPreview';
import { SettingsCard } from './components/SettingsCard';
import { StreamControls } from './components/StreamControls';
import { ConnectionInfo } from './components/ConnectionInfo';
import { useWebRTC } from './hooks/useWebRTC';
import { StreamSettings } from './types';
import { HelpCircle, Gamepad2 } from 'lucide-react';

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

export function App() {
  const [settings, setSettings] = useState<StreamSettings>({
    quality: '720p',
    fps: 60,
    enableAudio: true,
    enableMic: false,
    isolateDiscord: true,
    gameVolume: 1.0,
    micVolume: 1.0,
    port: 8080,
    pin: '',
    enableCloudflare: true,
  });

  const [localIp, setLocalIp] = useState<string>('localhost');
  const [cloudflareUrl, setCloudflareUrl] = useState<string | null>(null);

  const {
    status,
    stream,
    viewerCount,
    errorMessage,
    startStream,
    togglePause,
    stopStream,
  } = useWebRTC(settings);

  // Fetch local IP from backend when component mounts
  useEffect(() => {
    async function fetchLocalIp() {
      const ip = await tauriInvoke<string>('get_local_ip');
      if (ip) setLocalIp(ip);
    }
    fetchLocalIp();
  }, []);

  const handleStart = async () => {
    try {
      // 1. Tell Tauri Rust backend to start HTTP & WebSocket signaling server
      await tauriInvoke('start_stream_server', {
        port: settings.port,
        pin: settings.pin || null,
      });

      // 2. Start Cloudflare tunnel if enabled (non-blocking)
      if (settings.enableCloudflare) {
        tauriInvoke<string>('start_cloudflare_tunnel', {
          port: settings.port,
        }).then((cfUrl) => {
          if (cfUrl) setCloudflareUrl(cfUrl);
        }).catch((err) => {
          console.warn('Erro ao iniciar túnel do Cloudflare:', err);
        });

        // Polling fallback to check if URL appears
        const interval = setInterval(async () => {
          const url = await tauriInvoke<string>('get_cloudflare_url');
          if (url) {
            setCloudflareUrl(url);
            clearInterval(interval);
          }
        }, 1500);

        // Stop polling after 25s
        setTimeout(() => clearInterval(interval), 25000);
      } else {
        setCloudflareUrl(null);
      }

      // 3. Start local WebRTC screen/audio capture immediately
      await startStream();
    } catch (err) {
      console.error('Error initiating stream session:', err);
    }
  };

  const handleStop = async () => {
    stopStream();
    setCloudflareUrl(null);
    await tauriInvoke('stop_stream_server');
    await tauriInvoke('stop_cloudflare_tunnel');
  };

  const localViewerUrl = `http://${localIp}:${settings.port}`;

  return (
    <div className="relative min-h-screen bg-background text-zinc-100 flex flex-col font-sans selection:bg-zinc-700 selection:text-white">
      {/* Top Ambient Subtle Lighting */}
      <div className="ambient-glow"></div>

      <Header status={status} viewerCount={viewerCount} />

      <main className="relative z-10 flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Preview Studio e Controles */}
        <div className="lg:col-span-7 space-y-5 flex flex-col">
          <VideoPreview
            stream={stream}
            status={status}
            quality={settings.quality}
            fps={settings.fps}
          />

          <StreamControls
            status={status}
            errorMessage={errorMessage}
            onStart={handleStart}
            onPauseToggle={togglePause}
            onStop={handleStop}
          />

          <ConnectionInfo
            status={status}
            localUrl={localViewerUrl}
            cloudflareUrl={cloudflareUrl}
            viewerCount={viewerCount}
            pin={settings.pin}
          />
        </div>

        {/* Coluna Direita: Painel de Configurações & Quick Tips */}
        <div className="lg:col-span-5 space-y-5">
          <SettingsCard
            settings={settings}
            onChange={setSettings}
            status={status}
          />

          {/* Dica para Jogos */}
          <div className="rounded-2xl glass-panel-subtle p-4 text-xs text-zinc-400 space-y-2 border border-white/[0.06]">
            <div className="flex items-center gap-2 text-zinc-200 font-semibold">
              <Gamepad2 className="h-4 w-4 text-zinc-400" />
              <span>Dica para Transmissão de Jogos</span>
            </div>
            <p className="leading-relaxed text-[11px] text-zinc-400">
              Para transmitir o áudio do jogo sem capturar a voz dos amigos no Discord, escolha a aba <strong className="text-zinc-200">"Janela"</strong> no pop-up de captura e selecione a janela do seu jogo.
            </p>
            <div className="pt-1 flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
              <HelpCircle className="h-3 w-3 text-zinc-600" />
              <span>Latência estimada: &lt; 120ms (P2P Direto)</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
