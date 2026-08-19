<div align="center">

# 🎵 Harmony Desktop Streamer

**Transmissão de tela e áudio em tempo real (720p/1080p 60 FPS) para amigos via WebRTC P2P e Cloudflare Tunnel.**

[![Release](https://img.shields.io/github/v/release/jhonatacarvalho/harmony?color=indigo&label=Release)](https://github.com/jhonatacarvalho/harmony/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://github.com/jhonatacarvalho/harmony)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%20v2-24C8D8.svg)](https://tauri.app/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Download do Executável (.exe)](#-download) • [Como Funciona](#-como-funciona) • [Como Rodar](#-desenvolvimento) • [Especificações Técnicas](#-especificações-técnicas)

</div>

---

## 💡 Por que o Harmony?

Com bloqueios ou limitações em plataformas de voz e vídeo convencionais, o **Harmony** foi criado para ser uma solução **100% gratuita, privada, simples e de latência ultrabaixa (< 150ms)**. 

Seus amigos não precisam criar conta nem instalar nenhum aplicativo: **eles apenas abrem um link no navegador (Chrome, Edge, Firefox, Safari ou Celular) e assistem à sua gameplay ou filme ao vivo**.

---

## ✨ Principais Recursos

- ⚡ **Latência Ultra Baixa (< 150ms):** Usa WebRTC P2P direto (o vídeo vai da sua placa de rede direto para o navegador do seu amigo).
- 🎮 **Feito para Jogos (60 FPS):** Suporte nativo a 720p e 1080p a 60 quadros por segundo com aceleração por hardware (GPU/NVENC).
- 🔊 **Áudio do Jogo + Microfone:** Transmita o som do jogo e fale no microfone simultaneamente.
- 🌐 **Cloudflare Quick Tunnel Integrado:** Gera automaticamente um link público HTTPS (`https://*.trycloudflare.com`) sem precisar abrir portas no roteador (CGNAT) nem pagar por servidores.
- 🔒 **Proteção por PIN Opcional:** Defina uma senha de 4 a 8 dígitos para que apenas pessoas autorizadas entrem na sala.
- ⏸️ **Pausar e Retomar ao Vivo:** Pause a transmissão a qualquer momento sem desconectar seus amigos da sala.
- 💻 **Executável Leve:** Construído em Rust + Tauri v2, consumindo pouquíssima memória RAM e CPU.

---

## 📥 Download

Você pode baixar a versão mais recente pronta para Windows (`.exe` ou `.msi`) na página de **[Releases](https://github.com/jhonatacarvalho/harmony/releases)**.

---

## 🎮 Como Usar

1. Baixe e abra o **Harmony**.
2. Escolha a resolução desejada (**720p 60 FPS** é o recomendado para melhor estabilidade e desempenho em jogos).
3. Ative as chaves **"Som do Jogo"** e **"Ativar Cloudflare Quick Tunnel"**.
4. *(Opcional)* Defina um **PIN de Acesso**.
5. Clique no botão **"Iniciar Transmissão de Tela"**.
6. Na janela do Windows que abrir:
   - Vá na aba **"Tela Inteira"** (ou escolha a janela do jogo).
   - **Marque a caixinha "Compartilhar áudio do sistema"**.
7. Copie o **Link Público (Cloudflare)** gerado e envie para seus amigos!

---

## 🏗️ Arquitetura

```
[Seu Computador (Host)]
  │
  ├── 🖥️ Captura de Tela + Áudio (WebView2 Media Engine)
  ├── 🦀 Servidor Local Rust (Axum) ──> Serve o Player Web
  ├── ☁️ Cloudflare Tunnel ───────────> Gera Link HTTPS Público
  │
  └── 📡 Vídeo 1080p/720p 60FPS Direto (WebRTC P2P via STUN)
       │
       ├───> [Amigo 1 (Chrome)]
       └───> [Amigo 2 (Edge/Celular)]
```

---

## 🛠️ Desenvolvimento

Se você deseja compilar ou modificar o código-fonte:

### Pré-requisitos
- [Node.js](https://nodejs.org/) (v18+)
- [Rust & Cargo](https://rustup.rs/)
- [Cloudflare Tunnel CLI (`cloudflared`)](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) no PATH do sistema.

### Passo a Passo

```bash
# 1. Clone o repositório
git clone https://github.com/jhonatacarvalho/harmony.git
cd harmony

# 2. Instale as dependências
npm install

# 3. Execute em modo de desenvolvimento
npm run tauri dev

# 4. Compile o executável (.exe) de produção
npm run tauri build
```

---

## 📄 Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais detalhes.
