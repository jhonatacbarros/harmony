import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { VideoPreview } from './components/VideoPreview';
import { SettingsCard } from './components/SettingsCard';
import { StreamControls } from './components/StreamControls';
import { ConnectionInfo } from './components/ConnectionInfo';
import { useWebRTC } from './hooks/useWebRTC';
import { StreamSettings } from './types';

// Safe Tauri invoke helper
async function tauriInvoke<T>(cmd: string, args?: any): Promise<T | null> {
  try {
    // Dynamically check if running in Tauri environment
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

      // 2. Start Cloudflare tunnel if enabled
      if (settings.enableCloudflare) {
        try {
          const cfUrl = await tauriInvoke<string>('start_cloudflare_tunnel', {
            port: settings.port,
          });
          setCloudflareUrl(cfUrl || null);
        } catch (err) {
          console.warn('Erro ao iniciar túnel do Cloudflare:', err);
          setCloudflareUrl(null);
        }
      } else {
        setCloudflareUrl(null);
      }

      // 3. Start local WebRTC screen/audio capture
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
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <Header status={status} viewerCount={viewerCount} />

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna Esquerda: Preview e Controles Principais */}
        <div className="lg:col-span-7 space-y-6 flex flex-col">
          <VideoPreview stream={stream} status={status} />

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

        {/* Coluna Direita: Painel de Configurações */}
        <div className="lg:col-span-5 space-y-6">
          <SettingsCard
            settings={settings}
            onChange={setSettings}
            status={status}
          />

          {/* Dicas Rápidas de Transmissão */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-4 text-xs text-slate-400 space-y-2">
            <h4 className="font-semibold text-slate-300 flex items-center gap-1.5">
              💡 Dica para Jogos
            </h4>
            <p>
              Para transmitir o áudio do jogo no Windows, ao abrir o seletor de tela, escolha a aba <strong>"Tela Inteira"</strong> e certifique-se de marcar a caixinha <strong>"Compartilhar áudio do sistema"</strong>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
