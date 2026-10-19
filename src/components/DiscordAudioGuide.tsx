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
            <div className="p-2 rounded-xl bg-zinc-800 text-zinc-200 border border-white/10">
              <VolumeX className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Como Mutar o Discord na Stream</h3>
              <p className="text-[11px] text-zinc-400">Evite que seus amigos ouçam a própria voz com eco</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2 Métodos Rápidos */}
        <div className="space-y-3.5 text-xs text-zinc-300">
          {/* Método 1: Automático */}
          <div className="rounded-2xl bg-surface-300/90 p-4 border border-white/[0.06] space-y-2">
            <div className="flex items-center gap-2 font-semibold text-zinc-100">
              <Monitor className="h-4 w-4 text-emerald-400" />
              <span>Método 1: Modo Anti-Eco Discord (Automático)</span>
            </div>
            <ol className="space-y-1.5 pl-5 list-decimal text-[11px] text-zinc-400 leading-relaxed">
              <li>Deixe o <strong className="text-zinc-200">Modo Anti-Eco Discord</strong> ligado e o app alvo em "Sistema".</li>
              <li>O Harmony transmite todo o som do PC <strong className="text-zinc-100">exceto o Discord</strong>, igual ao próprio Discord faz.</li>
              <li>Abra o Discord <strong className="text-zinc-200">antes</strong> de iniciar a transmissão. Requer Windows 10 (2004) ou 11.</li>
              <li>Não assista à própria live com som neste PC: o som dela entra de volta na transmissão e vira eco.</li>
            </ol>
          </div>

          {/* Método 2: Só o jogo */}
          <div className="rounded-2xl bg-surface-300/90 p-4 border border-white/[0.06] space-y-2">
            <div className="flex items-center gap-2 font-semibold text-zinc-100">
              <Headphones className="h-4 w-4 text-zinc-300" />
              <span>Método 2: Transmitir Só o Jogo</span>
            </div>
            <ol className="space-y-1.5 pl-5 list-decimal text-[11px] text-zinc-400 leading-relaxed">
              <li>Escolha o jogo na lista de app alvo.</li>
              <li>Só o som daquele programa vai para a live; nada mais do PC entra.</li>
              <li>Usando microfone? Use fone de ouvido, senão o mic capta o jogo e a call pela caixa de som.</li>
            </ol>
          </div>
        </div>

        {/* Footer Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-100 hover:bg-white text-xs font-bold text-zinc-950 transition-all active:scale-98 shadow-lg shadow-white/5"
        >
          <CheckCircle className="h-4 w-4 text-zinc-950" />
          <span>Entendi, fechar</span>
        </button>
      </div>
    </div>
  );
};
