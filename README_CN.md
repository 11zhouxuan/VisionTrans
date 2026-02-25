<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="VisionTrans Logo">
</p>

<h1 align="center">VisionTrans</h1>

<p align="center">
  <strong>AI 视觉翻译 — 看到哪里，翻译哪里。</strong>
</p>

<p align="center">
  <a href="https://github.com/11zhouxuan/VisionTrans/releases"><img src="https://img.shields.io/github/v/release/11zhouxuan/VisionTrans?style=flat-square&color=blue" alt="Release"></a>
  <a href="https://github.com/11zhouxuan/VisionTrans/blob/master/LICENSE"><img src="https://img.shields.io/github/license/11zhouxuan/VisionTrans?style=flat-square" alt="License"></a>
  <a href="https://github.com/11zhouxuan/VisionTrans/releases"><img src="https://img.shields.io/github/downloads/11zhouxuan/VisionTrans/total?style=flat-square&color=green" alt="Downloads"></a>
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

---

## 痛点

你正在看一份 PDF、一段外语视频、或者一张设计稿——上面的文字**根本选不中**。传统翻译工具完全无能为力。你只能截图、打开翻译软件、上传图片、等待结果……工作流被彻底打断。

## 解决方案

**VisionTrans** 让你按一个快捷键，在屏幕上框选任意区域，即刻获得 AI 翻译——由多模态大模型直接**看图理解**，而不是先 OCR 再翻译。

> 🧠 与传统 "OCR → 翻译" 两步走不同，VisionTrans 将图片直接发送给 GPT-4o / Claude / Gemini，大模型能理解排版、上下文、甚至艺术字体，翻译质量远超传统方案。

---

## ✨ 核心功能

| | 功能 | 说明 |
|---|------|------|
| 🎯 | **框选即翻译** | 在屏幕上框选任意内容——图片、视频字幕、加密 PDF，统统能翻 |
| 🧠 | **AI 驱动** | 多模态大模型理解上下文、排版和视觉线索，翻译更准确自然 |
| ⚡ | **用完即走** | `Option+Q` → 框选 → 搞定。翻译结果悬浮卡片展示，不打断工作流 |
| 🎨 | **标记工具** | 画笔 + 矩形标记工具，精确标注需要翻译的区域 |
| 🔒 | **隐私安全** | 截图仅存在于内存中，从不写入磁盘。仅裁剪区域通过 HTTPS 加密发送 |
| 🌍 | **双语界面** | 完整的中英文界面支持 |
| 📖 | **单词本** | 自动保存翻译词汇，支持收藏、搜索、查询次数统计 |
| 🖥️ | **跨平台** | macOS（Apple Silicon + Intel）和 Windows |

---

## 📸 截图展示

<!-- TODO: 添加截图/GIF -->
<!-- ![截图](docs/screenshot.png) -->

*截图即将上线——先下载体验吧！*

---

## 🚀 快速开始

### 1. 下载安装

从 [GitHub Releases](https://github.com/11zhouxuan/VisionTrans/releases) 下载最新版本：

| 平台 | 下载文件 |
|------|---------|
| macOS (Apple Silicon) | `VisionTrans_x.x.x_aarch64.dmg` |
| macOS (Intel) | `VisionTrans_x.x.x_x64.dmg` |
| Windows | `VisionTrans_x.x.x_x64-setup.exe` |

### 2. 配置 API Key

首次启动时，引导向导会帮你完成：

1. **授予权限** — macOS 需要授予屏幕录制权限
2. **输入 API Key** — 支持任何 OpenAI 兼容格式的 API（GPT-4o、Claude、Gemini 等）
3. **设置快捷键** — 默认：`Option+Q`（macOS）/ `Alt+Q`（Windows）

### 3. 开始翻译！

1. 按下 `Option+Q`（或你自定义的快捷键）
2. 在需要翻译的文字周围画一个矩形框
3. 可以用画笔/标记工具进一步标注
4. 松手 — 1~3 秒内翻译结果出现在悬浮卡片中
5. 按 `Esc` 或点击其他区域关闭

---

## ⚙️ 配置说明

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | 大模型 API 密钥 | — |
| API Endpoint | 自定义 API 地址（支持代理/中转） | `https://api.openai.com/v1` |
| Model | 模型 ID（如 `gpt-4o`、`claude-3.5-sonnet`） | `gpt-4o` |
| 目标语言 | 翻译目标语言（支持模型能力范围内的任意语言） | 中文 |
| 快捷键 | 全局截图翻译快捷键 | `Option+Q` / `Alt+Q` |
| 代理 | HTTP/SOCKS5 代理配置 | 无 |

打开设置的方式：
- 系统托盘图标 → 设置
- macOS 菜单栏 → VisionTrans → 打开设置（`Cmd+,`）
- 点击 Dock 图标

---

## 🤖 支持的模型

VisionTrans 支持两种模型接入方式：

### 1. OpenAI 兼容 API（推荐）

兼容任何实现了 OpenAI Chat Completions API 的服务。**模型必须支持视觉（图片输入）能力。**

- **本地自部署（免费 & 私密）**：[Ollama](https://ollama.com/)、[vLLM](https://github.com/vllm-project/vllm)，或任何 OpenAI 兼容服务
- **云端 API**：GPT-4o、Claude（通过兼容代理）、Gemini 等

> 💡 **推荐方案**：安装 [Ollama](https://ollama.com/) 并运行 `ollama pull qwen3-vl:8b-instruct`，然后将 API Endpoint 设置为 `http://localhost:11434/v1` —— 完全免费、完全私密、无需 API Key。

### 2. AWS Bedrock

为企业用户提供原生 Amazon Bedrock 集成：

- 在设置中配置 Bedrock API Key、Model ID 和 Region
- 支持 Claude、Llama 等 Bedrock 上可用的模型

---

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| 核心框架 | [Tauri v2](https://v2.tauri.app/) |
| 后端 | Rust（屏幕截图、全局快捷键、LLM 客户端、窗口管理） |
| 前端 | React + TypeScript + TailwindCSS |
| AI | OpenAI 兼容格式多模态 API |
| 图标 | [Lucide](https://lucide.dev/) |
| 动画 | [Framer Motion](https://www.framer.com/motion/) |

---

## 🛠️ 本地开发

### 环境要求

- Node.js ≥ 18
- pnpm ≥ 8
- Rust ≥ 1.75
- macOS：Xcode Command Line Tools
- Windows：Visual Studio Build Tools 2022

### 开始开发

```bash
# 克隆仓库
git clone https://github.com/11zhouxuan/VisionTrans.git
cd VisionTrans

# 安装前端依赖
pnpm install

# 开发模式运行（支持热重载）
pnpm tauri dev

# 构建生产版本
pnpm tauri build
```

### macOS 一键构建安装

```bash
# 构建并安装到 /Applications（开发调试用）
./scripts/build-install.sh
```

### 项目结构

```
VisionTrans/
├── src/                    # React 前端
│   ├── pages/
│   │   ├── overlay/        # 截图遮罩 & 标注画布
│   │   ├── result/         # 翻译结果悬浮卡片
│   │   ├── settings/       # 设置页面
│   │   └── onboarding/     # 首次启动引导
│   ├── hooks/              # 共享 React Hooks
│   ├── lib/                # 工具库 & Tauri API 封装
│   └── types/              # TypeScript 类型定义
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── commands/       # Tauri IPC 命令
│   │   ├── services/       # 业务逻辑（截图、LLM、权限检测）
│   │   ├── hotkey.rs       # 全局快捷键管理
│   │   ├── tray.rs         # 系统托盘
│   │   └── state.rs        # 应用状态管理
│   └── capabilities/       # Tauri v2 权限声明
├── scripts/                # 构建 & 调试脚本
└── doc/                    # PRD & 技术设计文档
```

---

## 🗺️ 更新日志

### v1.0 — MVP 首发

- ✅ 全局快捷键截图翻译（`Option+Q` / `Alt+Q`）
- ✅ 矩形框选 + 暗色遮罩
- ✅ 画笔 + 矩形标记工具（粗细颜色可调）
- ✅ 多模态大模型翻译（OpenAI 兼容格式 API）
- ✅ 悬浮翻译结果卡片（复制 + 重试）
- ✅ 系统托盘快捷操作
- ✅ macOS 应用菜单集成（`Cmd+,` 打开设置）
- ✅ 首次启动引导向导
- ✅ 中英文双语界面
- ✅ 代理支持（HTTP/SOCKS5）
- ✅ 默认 80% 屏幕选区
- ✅ 标注撤销/重做
- ✅ 一键构建安装脚本

### 📖 单词本

每次翻译的内容会自动保存到你的个人单词本，功能包括：

- ⭐ **收藏** 重要词汇，方便快速复习
- 🔍 **搜索** 所有已保存的单词和翻译
- 📊 **查询次数** 统计——看看哪些词你查得最多
- 📁 **本地 JSON 存储** ——数据完全留在你的电脑上
- 🏷️ **自动标签** ——自动区分单词和短语

通过系统托盘 → 单词本，或应用菜单访问。

---

### 未来计划

- 🔜 多轮对话 —— 翻译后继续向 AI 提问，深入理解内容
- 🔜 S3 云同步单词本 —— 跨设备访问你的词汇数据
- 🔜 自定义 Prompt 模板

---

## 🤝 参与贡献

欢迎提交 Pull Request！

---

## 📄 开源协议

[MIT](LICENSE)

---

<p align="center">
  <sub>用 ❤️ 构建，基于 Tauri、Rust 和 React</sub>
</p>