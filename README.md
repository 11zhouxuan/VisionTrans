# VisionTrans - AI 视觉划词翻译工具

> 通过全局快捷键一键截屏 + 自由涂抹 + 多模态 LLM 视觉识别，实现对屏幕上任意元素的精准翻译。

## ✨ 核心功能

- **🎯 涂抹即翻译** - 用马克笔涂抹需要翻译的区域，松手即得翻译结果
- **🖼️ 图片也能翻** - 图片、视频字幕、PDF 加密文档都能翻译
- **⚡ 用完即走** - 不打断你的工作流，翻译结果悬浮卡片展示
- **🔒 隐私安全** - 截图数据仅存在于内存中，用完即焚

## 🛠️ 技术栈

- **核心框架**: Tauri v2
- **后端**: Rust
- **前端**: React + TypeScript + TailwindCSS
- **AI**: OpenAI 兼容格式多模态 API

## 📋 系统要求

- macOS 11+ / Windows 10+ (64-bit)
- Node.js ≥ 18
- pnpm ≥ 8
- Rust ≥ 1.75

## 🚀 快速开始

### 安装依赖

```bash
# 安装前端依赖
pnpm install

# Rust 依赖会在首次构建时自动下载
```

### 开发模式

```bash
pnpm tauri dev
```

### 构建生产包

```bash
pnpm tauri build
```

## 📖 使用方法

1. **唤醒**: 按下 `Option+Q` (macOS) 或 `Alt+Q` (Windows)
2. **涂抹**: 用鼠标涂抹或框选需要翻译的区域
3. **翻译**: 松开鼠标，等待 1-3 秒获得翻译结果
4. **关闭**: 按 `Esc` 或点击其他区域关闭结果卡片

## ⚙️ 配置

首次启动会引导你完成以下配置：

- **API Key**: 支持 OpenAI GPT-4o、Claude 3.5 Sonnet 等兼容 OpenAI 格式的 API
- **API Endpoint**: 支持自定义 API 地址（方便使用代理或第三方中转服务）
- **目标语言**: 中文（默认）/ 英文
- **快捷键**: 可自定义全局快捷键
- **代理**: 支持 HTTP/SOCKS5 代理

## 💰 费用说明

每次翻译约消耗 $0.005 - $0.02 API 费用（取决于图片大小和所选模型）。

## 📁 项目结构

```
VisionTrans/
├── doc/                    # 文档
├── src/                    # 前端 React 应用
│   ├── pages/              # 页面组件（按窗口划分）
│   │   ├── overlay/        # 遮罩画布页面
│   │   ├── result/         # 翻译结果页面
│   │   ├── settings/       # 设置页面
│   │   └── onboarding/     # 首次启动引导
│   ├── hooks/              # 全局共享 Hooks
│   ├── lib/                # 工具库
│   └── types/              # TypeScript 类型定义
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── commands/       # Tauri IPC 命令
│   │   ├── services/       # 业务逻辑服务
│   │   ├── hotkey.rs       # 全局快捷键
│   │   ├── tray.rs         # 系统托盘
│   │   ├── state.rs        # 应用状态
│   │   └── errors.rs       # 错误处理
│   └── capabilities/       # Tauri v2 权限声明
└── index.html              # Vite 入口
```

## 📄 License

MIT
