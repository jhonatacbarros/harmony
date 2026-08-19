import { type FC } from 'react';
import { X, Headphones, Monitor, CheckCircle, VolumeX } from 'lucide-react';

interface DiscordAudioGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiscordAudioGuide: FC<DiscordAudioGuideProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl glass-panel p-6 border border-white/10 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <VolumeX className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Como Mutar o Discord na Stream</h3>
              <p className="text-[11px] text-slate-400">Evite que seus amigos ouçam a própria voz com eco</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2 Métodos Rápidos */}
        <div className="space-y-3.5 text-xs text-slate-300">
          {/* Método 1: Janela do Jogo */}
          <div className="rounded-2xl bg-surface-300/80 p-3.5 border border-white/[0.06] space-y-2">
            <div className="flex items-center gap-2 font-semibold text-emerald-400">
              <Monitor className="h-4 w-4" />
              <span>Método 1: Capturar Janela do Jogo (Mais Fácil - Zero Config)</span>
            </div>
            <ol className="space-y-1.5 pl-5 list-decimal text-[11px] text-slate-400 leading-relaxed">
              <li>Clique em <strong className="text-slate-200">"Iniciar Transmissão de Tela"</strong> no Harmony.</li>
              <li>No pop-up de seleção do Windows, vá na aba <strong className="text-emerald-300">"Janela"</strong>.</li>
              <li>Escolha a janela do seu jogo (em vez de "Tela Inteira").</li>
              <li><strong className="text-white">Resultado:</strong> O Windows captura apenas o som daquele jogo específico e bloqueia o Discord automaticamente!</li>
            </ol>
          </div>

          {/* Método 2: Configuração de Áudio do Discord */}
          <div className="rounded-2xl bg-surface-300/80 p-3.5 border border-white/[0.06] space-y-2">
            <div className="flex items-center gap-2 font-semibold text-indigo-400">
              <Headphones className="h-4 w-4" />
              <span>Método 2: Separar Dispositivo de Saída no Discord</span>
            </div>
            <ol className="space-y-1.5 pl-5 list-decimal text-[11px] text-slate-400 leading-relaxed">
              <li>Abra o <strong>Discord</strong> e vá em <strong>Configurações de Usuário ⚙️ &gt; Voz e Vídeo</strong>.</li>
              <li>Em <strong>"Dispositivo de Saída"</strong>, se você tiver um fone (Headset/Chat), selecione-o diretamente em vez de "Default" (Padrão).</li>
              <li>No Harmony, o áudio do jogo continuará sendo transmitido pelo dispositivo padrão sem capturar a chamada do Discord.</li>
            </ol>
          </div>
        </div>

        {/* Footer Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all active:scale-98 shadow-glow-brand"
        >
          <CheckCircle className="h-4 w-4" />
          <span>Entendi, continuar</span>
        </button>
      </div>
    </div>
  );
};
