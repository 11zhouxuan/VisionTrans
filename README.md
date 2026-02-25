<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="VisionTrans Logo">
</p>

<h1 align="center">VisionTrans</h1>

<p align="center">
  <strong>AI-Powered Visual Translation — See It, Swipe It, Read It.</strong>
</p>

<p align="center">
  <a href="https://github.com/11zhouxuan/VisionTrans/releases"><img src="https://img.shields.io/github/v/release/11zhouxuan/VisionTrans?style=flat-square&color=blue" alt="Release"></a>
  <a href="https://github.com/11zhouxuan/VisionTrans/blob/master/LICENSE"><img src="https://img.shields.io/github/license/11zhouxuan/VisionTrans?style=flat-square" alt="License"></a>
  <a href="https://github.com/11zhouxuan/VisionTrans/releases"><img src="https://img.shields.io/github/downloads/11zhouxuan/VisionTrans/total?style=flat-square&color=green" alt="Downloads"></a>
</p>

<p align="center">
  <a href="README_CN.md">中文文档</a>
</p>

---

## The Problem

You're reading a PDF, watching a foreign video, or browsing a design with embedded text — and you **can't select the text**. Traditional translation tools are useless. You end up screenshotting, opening a translator, uploading the image, waiting... Your workflow is destroyed.

## The Solution

**VisionTrans** lets you press one hotkey, draw a rectangle on screen, and get an instant AI translation — powered by multimodal LLMs that **see and understand** the image context, not just OCR the text.

> 🧠 Unlike traditional OCR → Translate pipelines, VisionTrans sends the image directly to GPT-4o / Claude / Gemini, which understands layout, context, and even artistic fonts.

---

## ✨ Features

| | Feature | Description |
|---|---------|-------------|
| 🎯 | **Select & Translate** | Draw a rectangle on any screen content — images, videos, encrypted PDFs, anything |
| 🧠 | **AI-Powered** | Multimodal LLMs understand context, layout, and visual cues for superior translations |
| ⚡ | **Instant Workflow** | `Option+Q` → Select → Done. Result appears in a floating card. No app switching |
| 🎨 | **Annotation Tools** | Pen & rectangle markup tools to highlight exactly what you want translated |
| 🔒 | **Privacy First** | Screenshots exist only in memory — never written to disk. Only the cropped region is sent via HTTPS |
| 🌍 | **Bilingual UI** | Full Chinese & English interface support |
| 🖥️ | **Cross-Platform** | macOS (Apple Silicon + Intel) and Windows |

---

## 📸 Screenshots

<!-- TODO: Add screenshots/GIFs here -->
<!-- ![Screenshot](docs/screenshot.png) -->

*Screenshots coming soon — download and try it yourself!*

---

## 🚀 Quick Start

### 1. Download & Install

Download the latest release from [GitHub Releases](https://github.com/11zhouxuan/VisionTrans/releases):

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `VisionTrans_x.x.x_aarch64.dmg` |
| macOS (Intel) | `VisionTrans_x.x.x_x64.dmg` |
| Windows | `VisionTrans_x.x.x_x64-setup.exe` |

### 2. Configure API Key

On first launch, the onboarding wizard will guide you through:

1. **Grant Permissions** — macOS requires Screen Recording permission
2. **Enter API Key** — Supports any OpenAI-compatible API (GPT-4o, Claude, Gemini, etc.)
3. **Set Hotkey** — Default: `Option+Q` (macOS) / `Alt+Q` (Windows)

### 3. Start Translating!

1. Press `Option+Q` (or your custom hotkey)
2. Draw a rectangle around the text you want to translate
3. Use pen/marker tools to annotate if needed
4. Release — translation appears in a floating card within 1-3 seconds
5. Press `Esc` or click elsewhere to dismiss

---

## ⚙️ Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| API Key | Your LLM API key | — |
| API Endpoint | Custom API endpoint URL | `https://api.openai.com/v1` |
| Model | Model ID (e.g., `gpt-4o`, `claude-3.5-sonnet`) | `gpt-4o` |
| Target Language | Translation target language | Chinese |
| Hotkey | Global shortcut to trigger capture | `Option+Q` / `Alt+Q` |
| Proxy | HTTP/SOCKS5 proxy for API calls | None |

Access settings via:
- System tray icon → Settings
- macOS menu bar → VisionTrans → Settings (`Cmd+,`)
- Click the Dock icon

---

## 🤖 Supported Models

VisionTrans supports two provider modes:

### 1. OpenAI-Compatible API (Recommended)

Works with any service that implements the OpenAI chat completions API:

- **Self-hosted (Free & Private)**: [Ollama](https://ollama.com/), [vLLM](https://github.com/vllm-project/vllm), or any OpenAI-compatible server
- **Cloud APIs**: GPT-4o, Claude (via compatible proxy), Gemini, etc.

> 💡 **Recommended setup**: Install [Ollama](https://ollama.com/) and run `ollama pull qwen3-vl:8b-instruct`, then set API Endpoint to `http://localhost:11434/v1` — completely free, fully private, no API key needed.

### 2. AWS Bedrock

Native integration with Amazon Bedrock for enterprise users:

- Configure your Bedrock API Key, Model ID, and Region in Settings
- Supports Claude, Llama, and other models available on Bedrock

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri v2](https://v2.tauri.app/) |
| Backend | Rust (screenshot capture, hotkeys, LLM client, window management) |
| Frontend | React + TypeScript + TailwindCSS |
| AI | OpenAI-compatible multimodal API |
| Icons | [Lucide](https://lucide.dev/) |
| Animation | [Framer Motion](https://www.framer.com/motion/) |

---

## 🛠️ Development

### Prerequisites

- Node.js ≥ 18
- pnpm ≥ 8
- Rust ≥ 1.75
- macOS: Xcode Command Line Tools
- Windows: Visual Studio Build Tools 2022

### Setup

```bash
# Clone the repository
git clone https://github.com/11zhouxuan/VisionTrans.git
cd VisionTrans

# Install frontend dependencies
pnpm install

# Run in development mode (hot-reload)
pnpm tauri dev

# Build production release
pnpm tauri build
```

### Project Structure

```
VisionTrans/
├── src/                    # React frontend
│   ├── pages/
│   │   ├── overlay/        # Screen capture & annotation canvas
│   │   ├── result/         # Translation result floating card
│   │   ├── settings/       # Settings page
│   │   └── onboarding/     # First-launch wizard
│   ├── hooks/              # Shared React hooks
│   ├── lib/                # Utilities & Tauri API wrappers
│   └── types/              # TypeScript type definitions
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri IPC commands
│   │   ├── services/       # Business logic (screenshot, LLM, permissions)
│   │   ├── hotkey.rs       # Global shortcut management
│   │   ├── tray.rs         # System tray
│   │   └── state.rs        # App state management
│   └── capabilities/       # Tauri v2 permission declarations
├── scripts/                # Build & debug scripts
└── doc/                    # PRD & technical design docs
```

---

## 🗺️ Changelog

### v1.0 — MVP Release

- ✅ Global hotkey screen capture (`Option+Q` / `Alt+Q`)
- ✅ Rectangle selection with dark overlay mask
- ✅ Pen & rectangle annotation tools (adjustable thickness & color)
- ✅ Multimodal LLM translation (OpenAI-compatible API)
- ✅ Floating result card with copy & retry
- ✅ System tray with quick actions
- ✅ macOS app menu integration (`Cmd+,` for Settings)
- ✅ First-launch onboarding wizard
- ✅ Bilingual UI (Chinese & English)
- ✅ Proxy support (HTTP/SOCKS5)
- ✅ Default 80% screen selection area
- ✅ Undo/redo for annotations
- ✅ One-click build & install script

### Roadmap

- 🔜 More target languages (Japanese, Korean, French, German, etc.)
- 🔜 Translation history
- 🔜 Auto-start on boot
- 🔜 Custom prompt templates
- 🔜 Vocabulary book / favorites
- 🔜 Local OCR fallback for offline use

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built with ❤️ using Tauri, Rust, and React</sub>
</p>