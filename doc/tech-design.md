# 🏗️ 技术设计文档 (Tech Design)：VisionTrans v1.0 MVP

## 一、 文档概述

- **关联 PRD**：`doc/prd.md`
- **版本**：v1.0 MVP
- **技术栈**：Tauri v2 + Rust + React + TypeScript + TailwindCSS

---

## 二、 整体架构设计

### 2.1 分层架构

系统采用 Tauri v2 的标准分层架构，分为三层：

```
┌─────────────────────────────────────────────────────────────┐
│                      系统层 (OS Layer)                       │
│  全局快捷键 │ 屏幕截图 API │ 窗口管理 │ 系统托盘 │ 文件系统   │
└──────────────────────────┬──────────────────────────────────┘
                           │ FFI / System API
┌──────────────────────────▼──────────────────────────────────┐
│                   Rust 核心层 (Core Layer)                    │
│                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐    │
│  │ HotkeyMgr   │ │ CaptureMgr  │ │ WindowMgr           │    │
│  │ 快捷键管理   │ │ 屏幕截图     │ │ 遮罩窗口/卡片窗口    │    │
│  └─────────────┘ └─────────────┘ └─────────────────────┘    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐    │
│  │ TrayMgr     │ │ ConfigStore │ │ PermissionChecker   │    │
│  │ 系统托盘     │ │ 配置持久化   │ │ 权限检测(macOS)     │    │
│  └─────────────┘ └─────────────┘ └─────────────────────┘    │
│  ┌─────────────┐                                             │
│  │ LLMClient   │                                             │
│  │ API 调用客户端│                                             │
│  └─────────────┘                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri IPC (invoke / event)
┌──────────────────────────▼──────────────────────────────────┐
│                  前端 UI 层 (WebView Layer)                   │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────────────────┐     │
│  │  OverlayCanvas   │  │  ResultCard                  │     │
│  │  全屏遮罩画布     │  │  翻译结果悬浮卡片             │     │
│  │  - 涂抹绘制       │  │  - 翻译文本展示               │     │
│  │  - 矩形框选       │  │  - 复制/重试/关闭             │     │
│  │  - 图像裁剪       │  │  - 智能定位 & 拖拽            │     │
│  └──────────────────┘  └──────────────────────────────┘     │
│  ┌──────────────────┐  ┌──────────────────────────────┐     │
│  │  SettingsPage    │  │  OnboardingFlow              │     │
│  │  设置页面         │  │  首次启动引导                  │     │
│  └──────────────────┘  └──────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 窗口架构

Tauri 应用包含以下窗口实例：

| 窗口标识 | 类型 | 用途 | 生命周期 |
|---------|------|------|---------|
| `main` | 隐藏窗口 | 应用主进程载体，托管系统托盘逻辑 | 应用启动 → 退出 |
| `overlay` | 全屏无边框置顶窗口 | 屏幕冻结遮罩 + 涂抹画布 | 快捷键触发时创建 → 涂抹完成后销毁 |
| `result` | 小型无边框置顶窗口 | 翻译结果卡片 | LLM 返回结果时创建 → 用户关闭后销毁 |
| `settings` | 标准窗口 | 设置页面 | 用户打开设置时创建 → 关闭后隐藏(复用) |
| `onboarding` | 标准窗口 | 首次启动引导 | 首次启动时创建 → 完成后销毁 |

### 2.3 关键设计决策

| 决策点 | 方案选择 | 理由 |
|--------|---------|------|
| LLM API 调用层 | Rust 后端发起 HTTP 请求 | 避免 WebView 的 CORS 限制；Rust 的 `reqwest` 库性能好且支持代理配置 |
| 截图实现 | Rust 调用平台原生 API | 性能最优，可精确处理 HiDPI 和多屏 |
| 图像裁剪 | 前端 Canvas 完成 | Canvas 天然支持像素操作，避免 IPC 传输大量坐标数据 |
| 配置存储 | Tauri 内置 `tauri-plugin-store` | 开箱即用，JSON 格式，跨平台兼容 |
| 遮罩窗口方案 | 每次创建新窗口 | 避免常驻隐藏窗口占用内存；Tauri v2 窗口创建速度足够快 |

---

## 三、 项目工程结构

```
VisionTrans/
├── doc/                          # 文档
│   ├── prd.md                    # 产品需求文档
│   └── tech-design.md            # 技术设计文档（本文件）
│
├── src-tauri/                    # Rust 后端
│   ├── Cargo.toml                # Rust 依赖管理
│   ├── tauri.conf.json           # Tauri 配置（窗口、权限、插件等）
│   ├── capabilities/             # Tauri v2 权限能力声明
│   │   └── default.json
│   ├── icons/                    # 应用图标（各平台各尺寸）
│   ├── src/
│   │   ├── main.rs               # 入口：初始化 Tauri App、注册插件和命令
│   │   ├── lib.rs                # 库入口：模块导出
│   │   ├── commands/             # Tauri IPC 命令（前端可调用）
│   │   │   ├── mod.rs
│   │   │   ├── capture.rs        # 截屏相关命令
│   │   │   ├── translate.rs      # LLM 翻译相关命令
│   │   │   ├── config.rs         # 配置读写命令
│   │   │   ├── window.rs         # 窗口管理命令
│   │   │   └── permission.rs     # 权限检测命令
│   │   ├── services/             # 业务逻辑服务
│   │   │   ├── mod.rs
│   │   │   ├── screenshot.rs     # 屏幕截图服务（多屏 + HiDPI）
│   │   │   ├── llm_client.rs     # LLM API 客户端（OpenAI 兼容格式）
│   │   │   └── permission.rs     # macOS 权限检测服务
│   │   ├── hotkey.rs             # 全局快捷键注册与管理
│   │   ├── tray.rs               # 系统托盘初始化与菜单
│   │   ├── state.rs              # 应用全局状态管理（AppState）
│   │   └── errors.rs             # 统一错误类型定义
│   └── build.rs                  # 构建脚本
│
├── src/                          # 前端 React 应用
│   ├── main.tsx                  # React 入口
│   ├── App.tsx                   # 路由 / 窗口分发
│   ├── vite-env.d.ts
│   ├── styles/
│   │   └── globals.css           # TailwindCSS 全局样式
│   ├── pages/                    # 页面级组件（按窗口划分）
│   │   ├── overlay/              # 遮罩画布页面（overlay 窗口）
│   │   │   ├── OverlayPage.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useCanvas.ts          # Canvas 绑定与绘制逻辑
│   │   │   │   ├── useBrushMode.ts       # 涂抹模式逻辑
│   │   │   │   ├── useRectMode.ts        # 矩形框选逻辑
│   │   │   │   └── useImageCrop.ts       # 图像裁剪逻辑
│   │   │   └── components/
│   │   │       └── ToolBar.tsx           # 工具栏（涂抹/框选切换）
│   │   ├── result/               # 翻译结果页面（result 窗口）
│   │   │   ├── ResultPage.tsx
│   │   │   └── components/
│   │   │       └── ResultCard.tsx        # 翻译结果卡片
│   │   ├── settings/             # 设置页面（settings 窗口）
│   │   │   ├── SettingsPage.tsx
│   │   │   └── components/
│   │   │       ├── ApiSettings.tsx       # API 配置区
│   │   │       ├── HotkeySettings.tsx    # 快捷键配置区
│   │   │       ├── ProxySettings.tsx     # 代理配置区
│   │   │       └── LanguageSettings.tsx  # 语言配置区
│   │   └── onboarding/           # 首次启动引导（onboarding 窗口）
│   │       ├── OnboardingPage.tsx
│   │       └── steps/
│   │           ├── WelcomeStep.tsx
│   │           ├── PermissionStep.tsx
│   │           ├── ApiKeyStep.tsx
│   │           ├── HotkeyStep.tsx
│   │           └── CompleteStep.tsx
│   ├── hooks/                    # 全局共享 Hooks
│   │   ├── useTauriInvoke.ts     # Tauri IPC 调用封装
│   │   └── useTauriEvent.ts      # Tauri 事件监听封装
│   ├── lib/                      # 工具库
│   │   ├── tauri-api.ts          # Tauri 命令调用封装（类型安全）
│   │   └── constants.ts          # 常量定义
│   └── types/                    # TypeScript 类型定义
│       ├── config.ts             # 配置相关类型
│       └── translate.ts          # 翻译相关类型
│
├── index.html                    # Vite 入口 HTML
├── package.json                  # 前端依赖管理
├── tsconfig.json                 # TypeScript 配置
├── vite.config.ts                # Vite 构建配置
├── tailwind.config.js            # TailwindCSS 配置
├── postcss.config.js             # PostCSS 配置
└── README.md
```

---

## 四、 Rust 后端模块设计

### 4.1 Rust 依赖清单 (Cargo.toml)

| Crate | 用途 | 说明 |
|-------|------|------|
| `tauri` v2 | 核心框架 | 窗口管理、IPC、插件系统 |
| `tauri-plugin-global-shortcut` | 全局快捷键 | Tauri v2 官方插件 |
| `tauri-plugin-store` | 配置持久化 | JSON 文件存储 |
| `tauri-plugin-clipboard-manager` | 剪贴板 | 一键复制翻译结果 |
| `tauri-plugin-single-instance` | 单例模式 | 防止多实例运行 |
| `reqwest` | HTTP 客户端 | 调用 LLM API，支持代理 |
| `serde` / `serde_json` | 序列化 | JSON 数据处理 |
| `tokio` | 异步运行时 | 异步 HTTP 请求 |
| `base64` | Base64 编解码 | 图片编码 |
| `xcap` | 屏幕截图 | 跨平台截屏库，支持多屏和 HiDPI |
| `image` | 图像处理 | PNG 编码 |
| `thiserror` | 错误处理 | 自定义错误类型 |

### 4.2 应用状态管理 (`state.rs`)

```rust
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

/// 应用运行时全局状态，通过 Tauri 的 State 机制注入
pub struct AppState {
    /// 当前是否处于截屏/涂抹状态
    pub is_capturing: Mutex<bool>,
    /// 当前是否暂停快捷键监听
    pub is_paused: Mutex<bool>,
    /// 最近一次截屏的 Base64 数据（用于传递给 overlay 窗口）
    pub last_screenshot: Mutex<Option<ScreenshotData>>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ScreenshotData {
    /// Base64 编码的 PNG 图片
    pub base64: String,
    /// 截图的逻辑宽度（CSS 像素）
    pub logical_width: u32,
    /// 截图的逻辑高度（CSS 像素）
    pub logical_height: u32,
    /// 设备像素比 (DPR)
    pub scale_factor: f64,
}
```

### 4.3 屏幕截图服务 (`services/screenshot.rs`)

**职责**：调用系统 API 截取当前鼠标所在屏幕的全屏图像。

**核心逻辑**：

```rust
use xcap::Monitor;

pub fn capture_current_screen() -> Result<ScreenshotData, AppError> {
    // 1. 获取当前鼠标位置
    let cursor_pos = get_cursor_position()?;

    // 2. 遍历所有显示器，找到鼠标所在的屏幕
    let monitors = Monitor::all()?;
    let target_monitor = monitors.iter()
        .find(|m| is_point_in_monitor(cursor_pos, m))
        .ok_or(AppError::NoMonitorFound)?;

    // 3. 截取该屏幕的全屏图像
    let image = target_monitor.capture_image()?;

    // 4. 编码为 PNG -> Base64
    let base64 = encode_image_to_base64(&image)?;

    // 5. 计算逻辑尺寸（物理像素 / DPR）
    let scale_factor = target_monitor.scale_factor();
    Ok(ScreenshotData {
        base64,
        logical_width: (image.width() as f64 / scale_factor) as u32,
        logical_height: (image.height() as f64 / scale_factor) as u32,
        scale_factor,
    })
}
```

**平台差异**：
- **macOS**：需要"屏幕录制"权限，首次调用可能失败，需引导用户授权
- **Windows**：无需特殊权限，直接调用 Win32 API

### 4.4 LLM 客户端服务 (`services/llm_client.rs`)

**职责**：封装 OpenAI 兼容格式的多模态 API 调用。

```rust
#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    max_tokens: u32,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: Vec<ContentPart>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum ContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrlDetail },
}

#[derive(Serialize)]
struct ImageUrlDetail {
    url: String,       // "data:image/png;base64,{base64_data}"
    detail: String,    // "high" | "low" | "auto"
}

/// 调用 LLM API 进行翻译
pub async fn translate(
    config: &LLMConfig,
    image_base64: &str,
    target_language: &str,
) -> Result<TranslateResult, AppError> {
    let prompt = format!(
        "识别图片中被高亮标记的文本内容，结合整体图像的上下文语境，\
         将其翻译为{}。直接输出翻译结果，保持原意和专业词汇的准确性。\
         如果图片中没有可识别的文本，请回复"未检测到需要翻译的文本"。",
        target_language
    );

    let client = build_http_client(&config.proxy)?;

    let request = ChatRequest {
        model: config.model.clone(),
        messages: vec![Message {
            role: "user".into(),
            content: vec![
                ContentPart::Text { text: prompt },
                ContentPart::ImageUrl {
                    image_url: ImageUrlDetail {
                        url: format!("data:image/png;base64,{}", image_base64),
                        detail: "high".into(),
                    },
                },
            ],
        }],
        max_tokens: 1024,
    };

    let response = client
        .post(&format!("{}/chat/completions", config.endpoint))
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&request)
        .timeout(Duration::from_secs(30))
        .send()
        .await?;

    // 解析响应...
}
```

**代理支持**：

```rust
fn build_http_client(proxy_config: &Option<ProxyConfig>) -> Result<reqwest::Client, AppError> {
    let mut builder = reqwest::Client::builder();
    if let Some(proxy) = proxy_config {
        let proxy_url = match proxy.protocol {
            ProxyProtocol::Http => reqwest::Proxy::all(&proxy.url)?,
            ProxyProtocol::Socks5 => reqwest::Proxy::all(&proxy.url)?,
        };
        builder = builder.proxy(proxy_url);
    }
    Ok(builder.build()?)
}
```

### 4.5 全局快捷键模块 (`hotkey.rs`)

**职责**：注册/注销全局快捷键，触发截屏流程。

```rust
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub fn setup_hotkey(app: &tauri::App) -> Result<(), AppError> {
    let shortcut = app.global_shortcut();

    // 从配置中读取用户自定义快捷键，默认 Option+Q / Alt+Q
    let hotkey_str = get_configured_hotkey(app)?;
    let parsed: Shortcut = hotkey_str.parse()?;

    shortcut.on_shortcut(parsed, move |app_handle, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            // 触发截屏流程
            let _ = trigger_capture(app_handle);
        }
    })?;

    Ok(())
}

fn trigger_capture(app: &tauri::AppHandle) -> Result<(), AppError> {
    let state = app.state::<AppState>();

    // 防止重复触发
    let mut is_capturing = state.is_capturing.lock().unwrap();
    if *is_capturing { return Ok(()); }
    *is_capturing = true;

    // 1. 截取屏幕
    let screenshot = capture_current_screen()?;

    // 2. 存储截图数据到状态
    *state.last_screenshot.lock().unwrap() = Some(screenshot.clone());

    // 3. 创建全屏遮罩窗口
    create_overlay_window(app, &screenshot)?;

    Ok(())
}
```

### 4.6 系统托盘模块 (`tray.rs`)

**职责**：创建系统托盘图标和右键菜单。

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
};

pub fn setup_tray(app: &tauri::App) -> Result<TrayIcon, AppError> {
    let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let pause_item = MenuItem::with_id(app, "pause", "暂停监听", true, None::<&str>)?;
    let about_item = MenuItem::with_id(app, "about", "关于", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&settings_item, &pause_item, &about_item, &quit_item])?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "settings" => { /* 打开设置窗口 */ },
                "pause"    => { /* 切换暂停/恢复状态 */ },
                "about"    => { /* 显示关于信息 */ },
                "quit"     => { app.exit(0); },
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { .. } = event {
                // 左键单击：显示/隐藏设置窗口
            }
        })
        .build(app)?;

    Ok(tray)
}
```

### 4.7 权限检测服务 (`services/permission.rs`)

**职责**：检测 macOS 屏幕录制权限状态。

```rust
#[cfg(target_os = "macos")]
pub fn check_screen_recording_permission() -> bool {
    // 调用 macOS CoreGraphics API 检测权限
    // CGPreflightScreenCaptureAccess() - macOS 10.15+
    unsafe {
        CGPreflightScreenCaptureAccess()
    }
}

#[cfg(target_os = "macos")]
pub fn request_screen_recording_permission() -> bool {
    // CGRequestScreenCaptureAccess() - 会弹出系统授权对话框
    unsafe {
        CGRequestScreenCaptureAccess()
    }
}

#[cfg(not(target_os = "macos"))]
pub fn check_screen_recording_permission() -> bool {
    true // Windows 无需特殊权限
}
```

### 4.8 统一错误处理 (`errors.rs`)

```rust
use thiserror::Error;
use serde::Serialize;

#[derive(Error, Debug, Serialize)]
pub enum AppError {
    #[error("屏幕截图失败: {0}")]
    CaptureError(String),

    #[error("API Key 未配置")]
    ApiKeyNotConfigured,

    #[error("API 认证失败，请检查 API Key")]
    ApiAuthError,

    #[error("网络请求超时，请检查网络连接")]
    NetworkTimeout,

    #[error("网络不可用")]
    NetworkUnavailable,

    #[error("API 调用频率限制")]
    RateLimitExceeded,

    #[error("LLM 返回异常: {0}")]
    LLMResponseError(String),

    #[error("macOS 屏幕录制权限未授予")]
    ScreenRecordingPermissionDenied,

    #[error("未找到显示器")]
    NoMonitorFound,

    #[error("窗口创建失败: {0}")]
    WindowError(String),

    #[error("配置读写错误: {0}")]
    ConfigError(String),

    #[error("内部错误: {0}")]
    Internal(String),
}

// 实现 Into<tauri::InvokeError> 以便在 IPC 命令中返回
impl From<AppError> for tauri::ipc::InvokeError {
    fn from(err: AppError) -> Self {
        tauri::ipc::InvokeError::from(err.to_string())
    }
}
```

---

## 五、 前端模块设计

### 5.1 前端依赖清单 (package.json)

| 依赖 | 用途 | 说明 |
|------|------|------|
| `react` / `react-dom` | UI 框架 | v18+ |
| `typescript` | 类型安全 | 严格模式 |
| `@tauri-apps/api` | Tauri 前端 API | IPC 调用、事件监听 |
| `@tauri-apps/plugin-store` | 配置存储前端绑定 | 读写配置 |
| `@tauri-apps/plugin-clipboard-manager` | 剪贴板前端绑定 | 复制翻译结果 |
| `tailwindcss` | CSS 框架 | 原子化 CSS |
| `vite` | 构建工具 | 开发服务器 + 打包 |
| `lucide-react` | 图标库 | 轻量 SVG 图标 |
| `framer-motion` | 动画库 | 卡片出现/消失动画 |

### 5.2 窗口路由分发 (`App.tsx`)

由于 Tauri 多窗口共享同一前端代码，需要根据窗口标签 (label) 渲染不同页面：

```tsx
import { getCurrentWindow } from '@tauri-apps/api/window';

function App() {
  const [windowLabel, setWindowLabel] = useState<string>('');

  useEffect(() => {
    const label = getCurrentWindow().label;
    setWindowLabel(label);
  }, []);

  switch (windowLabel) {
    case 'overlay':
      return <OverlayPage />;
    case 'result':
      return <ResultPage />;
    case 'settings':
      return <SettingsPage />;
    case 'onboarding':
      return <OnboardingPage />;
    default:
      return null; // main 窗口不渲染 UI
  }
}
```

### 5.3 遮罩画布模块 (`pages/overlay/`)

这是整个前端最核心的模块，负责屏幕冻结效果和涂抹交互。

#### 5.3.1 OverlayPage 组件结构

```tsx
function OverlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { mode, setMode } = useState<'brush' | 'rect'>('brush');
  const { screenshotBase64 } = useScreenshot();  // 从 Rust 获取截图

  // Canvas 初始化：将截图绘制为背景
  useCanvas(canvasRef, screenshotBase64);

  // 涂抹模式 Hook
  const brushHandlers = useBrushMode(canvasRef);

  // 矩形框选模式 Hook
  const rectHandlers = useRectMode(canvasRef);

  // 图像裁剪 Hook
  const { cropAndSend } = useImageCrop(canvasRef);

  // 鼠标松开时触发裁剪 + 翻译
  const handleMouseUp = async (e: React.MouseEvent) => {
    const croppedBase64 = cropAndSend(/* 涂抹轨迹坐标 */);
    if (croppedBase64) {
      // 关闭遮罩窗口
      await getCurrentWindow().close();
      // 通知 Rust 发起翻译
      await invoke('start_translation', {
        imageBase64: croppedBase64,
        position: { x: e.screenX, y: e.screenY }
      });
    }
  };

  // Esc / 右键取消
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') getCurrentWindow().close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 cursor-crosshair" onContextMenu={handleCancel}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={mode === 'brush' ? brushHandlers.onMouseDown : rectHandlers.onMouseDown}
        onMouseMove={mode === 'brush' ? brushHandlers.onMouseMove : rectHandlers.onMouseMove}
        onMouseUp={handleMouseUp}
      />
    </div>
  );
}
```

#### 5.3.2 useCanvas Hook - Canvas 初始化

```typescript
function useCanvas(
  canvasRef: RefObject<HTMLCanvasElement>,
  screenshotBase64: string | null
) {
  useEffect(() => {
    if (!canvasRef.current || !screenshotBase64) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;

    // 设置 Canvas 物理尺寸 = 窗口尺寸 × devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr);

    // 将截图绘制为背景
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, window.innerWidth, window.innerHeight);
    };
    img.src = `data:image/png;base64,${screenshotBase64}`;
  }, [screenshotBase64]);
}
```

#### 5.3.3 useBrushMode Hook - 涂抹模式

```typescript
function useBrushMode(canvasRef: RefObject<HTMLCanvasElement>) {
  const isDrawing = useRef(false);
  const points = useRef<Array<{x: number, y: number}>>([]);

  const onMouseDown = (e: React.MouseEvent) => {
    isDrawing.current = true;
    points.current = [{ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }];
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const point = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    points.current.push(point);

    // 绘制半透明高亮线条（马克笔效果）
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 230, 0, 0.35)';  // 黄色半透明
    ctx.lineWidth = 24;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const prev = points.current[points.current.length - 2];
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  return { onMouseDown, onMouseMove, points };
}
```

#### 5.3.4 useImageCrop Hook - 图像裁剪

```typescript
function useImageCrop(canvasRef: RefObject<HTMLCanvasElement>) {
  const cropAndSend = (points: Array<{x: number, y: number}>) => {
    if (points.length < 2) return null;

    // 计算最小外接矩形
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.max(0, Math.min(...xs) - 10);  // 留 10px 边距
    const minY = Math.max(0, Math.min(...ys) - 10);
    const maxX = Math.min(window.innerWidth, Math.max(...xs) + 10);
    const maxY = Math.min(window.innerHeight, Math.max(...ys) + 10);

    const width = maxX - minX;
    const height = maxY - minY;

    // 过滤过小区域（< 20px）
    if (width < 20 || height < 20) return null;

    // 从 Canvas 裁剪指定区域
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvasRef.current!.getContext('2d')!;
    const imageData = ctx.getImageData(
      minX * dpr, minY * dpr,
      width * dpr, height * dpr
    );

    // 创建临时 Canvas 导出为 Base64
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width * dpr;
    tempCanvas.height = height * dpr;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);

    return tempCanvas.toDataURL('image/png').split(',')[1]; // 去掉 data:image/png;base64, 前缀
  };

  return { cropAndSend };
}
```

### 5.4 翻译结果卡片模块 (`pages/result/`)

#### 5.4.1 ResultCard 组件

```tsx
function ResultCard() {
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // 监听翻译结果事件
  useEffect(() => {
    const unlisten = listen<TranslateResult>('translation-result', (event) => {
      setResult(event.payload);
      setLoading(false);
    });

    const unlistenError = listen<string>('translation-error', (event) => {
      setError(event.payload);
      setLoading(false);
    });

    return () => { unlisten.then(f => f()); unlistenError.then(f => f()); };
  }, []);

  // 智能定位：避开屏幕边缘
  const cardStyle = useSmartPosition(position);

  // 拖拽移动
  const dragHandlers = useDrag(position, setPosition);

  // 一键复制
  const handleCopy = async () => {
    await writeText(result?.translation || '');
    // 显示复制成功提示
  };

  // 关闭：Esc 或点击外部
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') getCurrentWindow().close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-xl shadow-2xl p-4 max-w-sm border border-gray-100"
      style={cardStyle}
      {...dragHandlers}
    >
      {/* 源语言标识 */}
      <div className="text-xs text-gray-400 mb-2">
        {result?.sourceLanguage} → {result?.targetLanguage}
      </div>

      {/* 翻译结果 */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorDisplay message={error} onRetry={handleRetry} />
      ) : (
        <p className="text-gray-800 text-sm leading-relaxed">
          {result?.translation}
        </p>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={handleRetry} title="重新翻译">
          <RefreshIcon className="w-4 h-4" />
        </button>
        <button onClick={handleCopy} title="复制">
          <CopyIcon className="w-4 h-4" />
        </button>
        <button onClick={() => getCurrentWindow().close()} title="关闭">
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
```

#### 5.4.2 智能定位算法

```typescript
function useSmartPosition(initialPos: { x: number, y: number }) {
  const CARD_WIDTH = 360;
  const CARD_HEIGHT = 200; // 预估最大高度
  const MARGIN = 12;

  let x = initialPos.x + MARGIN;
  let y = initialPos.y + MARGIN;

  // 右边界检测
  if (x + CARD_WIDTH > window.innerWidth) {
    x = initialPos.x - CARD_WIDTH - MARGIN;
  }
  // 下边界检测
  if (y + CARD_HEIGHT > window.innerHeight) {
    y = initialPos.y - CARD_HEIGHT - MARGIN;
  }
  // 确保不超出左/上边界
  x = Math.max(MARGIN, x);
  y = Math.max(MARGIN, y);

  return { left: x, top: y, position: 'fixed' as const };
}
```

### 5.5 设置页面模块 (`pages/settings/`)

设置页面采用标准表单布局，分为以下配置区：

| 配置区组件 | 配置项 | 说明 |
|-----------|--------|------|
| `ApiSettings` | API Key、API Endpoint、模型选择 | 支持测试连接按钮 |
| `LanguageSettings` | 目标语言（中文/英文） | 下拉选择 |
| `HotkeySettings` | 全局快捷键 | 快捷键录入组件，按下组合键即录入 |
| `ProxySettings` | 代理协议、代理地址 | HTTP/SOCKS5 选择 + 地址输入 |

**配置读写**：通过 `@tauri-apps/plugin-store` 直接读写本地 JSON 文件，无需经过 Rust IPC。

### 5.6 首次启动引导模块 (`pages/onboarding/`)

采用步骤式向导 (Stepper) 模式：

```tsx
function OnboardingPage() {
  const [step, setStep] = useState(0);
  const steps = [
    <WelcomeStep />,
    <PermissionStep />,    // macOS 显示，Windows 跳过
    <ApiKeyStep />,
    <HotkeyStep />,
    <CompleteStep />,
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* 步骤指示器 */}
      <StepIndicator current={step} total={steps.length} />

      {/* 步骤内容 */}
      <div className="flex-1">{steps[step]}</div>

      {/* 导航按钮 */}
      <div className="flex justify-between p-6">
        <button onClick={() => setStep(s => s - 1)} disabled={step === 0}>
          上一步
        </button>
        <button onClick={() => step === steps.length - 1 ? finish() : setStep(s => s + 1)}>
          {step === steps.length - 1 ? '开始使用' : '下一步'}
        </button>
      </div>
    </div>
  );
}
```

---

## 六、 核心数据流与时序

### 6.1 主流程时序图

```
用户          Rust 核心层              前端 (overlay)         前端 (result)        LLM API
 │                │                       │                      │                  │
 │─ Option+Q ───▶│                       │                      │                  │
 │                │── 截取屏幕 ──────────▶│                      │                  │
 │                │   (ScreenshotData)    │                      │                  │
 │                │── 创建 overlay 窗口 ─▶│                      │                  │
 │                │                       │── 渲染截图为背景      │                  │
 │                │                       │   (Canvas)           │                  │
 │─ 涂抹/框选 ──────────────────────────▶│                      │                  │
 │                │                       │── 绘制高亮轨迹       │                  │
 │─ 松开鼠标 ──────────────────────────▶│                      │                  │
 │                │                       │── 计算最小外接矩形    │                  │
 │                │                       │── 裁剪 Canvas 图像   │                  │
 │                │                       │── 转为 Base64        │                  │
 │                │◀─ invoke:             │                      │                  │
 │                │   start_translation   │                      │                  │
 │                │   {base64, position}  │                      │                  │
 │                │                       │── 关闭 overlay 窗口  │                  │
 │                │                       ×                      │                  │
 │                │── 创建 result 窗口 ──────────────────────────▶│                  │
 │                │   (position, loading)                        │── 显示 Loading   │
 │                │                                              │                  │
 │                │── 读取配置 (API Key, Endpoint, Model) ──────────────────────────│
 │                │── POST /chat/completions ────────────────────────────────────▶│
 │                │   {model, messages: [{image + prompt}]}                       │
 │                │◀─────────────────────────────────── 翻译结果 ─────────────────│
 │                │                                              │                  │
 │                │── emit: translation-result ──────────────────▶│                  │
 │                │                                              │── 渲染翻译结果   │
 │                │                                              │── 隐藏 Loading   │
 │                │                                              │                  │
 │─ 点击复制 ──────────────────────────────────────────────────▶│                  │
 │                │                                              │── 写入剪贴板     │
 │─ Esc/点击外部 ──────────────────────────────────────────────▶│                  │
 │                │                                              │── 关闭 result    │
 │                │                                              ×                  │
```

### 6.2 异常流时序

```
场景：API Key 未配置
─────────────────────
用户 ─ Option+Q ─▶ Rust ─ 截屏 ─▶ overlay ─ 涂抹 ─▶ invoke: start_translation
                    Rust ─ 检查配置 ─▶ 发现 API Key 为空
                    Rust ─ emit: translation-error("API Key 未配置") ─▶ result 窗口
                    result ─ 显示错误提示 + "前往设置"按钮

场景：网络超时
─────────────
用户涂抹完成 ─▶ Rust ─ POST LLM API ─▶ 30s 超时
                Rust ─ emit: translation-error("网络请求超时") ─▶ result 窗口
                result ─ 显示超时提示 + "重试"按钮

场景：macOS 权限未授予
────────────────────
用户 ─ Option+Q ─▶ Rust ─ capture_current_screen() ─▶ 权限检查失败
                    Rust ─ 弹出系统权限引导对话框
                    Rust ─ 打开系统设置 → 隐私与安全性 → 屏幕录制
```

### 6.3 数据流转格式

| 阶段 | 数据格式 | 大小预估 |
|------|---------|---------|
| 全屏截图 (Rust 内存) | `image::RgbaImage` (原始像素) | ~30MB (2560×1600×4) |
| 截图传递给前端 | Base64 编码的 PNG | ~2-5MB |
| 涂抹裁剪后的图片 | Base64 编码的 PNG | ~100KB-1MB |
| LLM API 请求体 | JSON (含 Base64 图片) | ~150KB-1.5MB |
| LLM API 响应体 | JSON (翻译文本) | ~1-5KB |

---

## 七、 IPC 通信协议设计

### 7.1 Tauri Commands（前端 → Rust）

前端通过 `invoke()` 调用 Rust 后端命令，所有命令均为异步。

#### `get_screenshot`
获取最近一次截屏数据。

```typescript
// 前端调用
const data = await invoke<ScreenshotData>('get_screenshot');

// Rust 定义
#[tauri::command]
async fn get_screenshot(state: State<'_, AppState>) -> Result<ScreenshotData, AppError> {
    state.last_screenshot.lock().unwrap().clone()
        .ok_or(AppError::Internal("无截图数据".into()))
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| (无) | - | - |
| **返回值** | `ScreenshotData` | `{ base64, logical_width, logical_height, scale_factor }` |

#### `start_translation`
发起翻译请求（前端传入裁剪后的图片，Rust 调用 LLM API）。

```typescript
// 前端调用
await invoke('start_translation', {
  imageBase64: croppedBase64,
  position: { x: 500, y: 300 }
});
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `imageBase64` | `string` | 裁剪后的图片 Base64 |
| `position` | `{ x: number, y: number }` | 鼠标松开时的屏幕坐标（用于定位结果卡片） |
| **返回值** | `void` | 翻译结果通过事件异步推送 |

#### `test_api_connection`
测试 LLM API 连接是否正常。

```typescript
const result = await invoke<boolean>('test_api_connection', {
  apiKey: 'sk-xxx',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o'
});
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `apiKey` | `string` | API Key |
| `endpoint` | `string` | API Endpoint |
| `model` | `string` | 模型名称 |
| **返回值** | `boolean` | 连接是否成功 |

#### `check_permission`
检测系统权限状态（macOS 屏幕录制权限）。

| 参数 | 类型 | 说明 |
|------|------|------|
| (无) | - | - |
| **返回值** | `{ screenRecording: boolean }` | 权限状态 |

#### `request_permission`
请求系统权限（macOS 弹出授权对话框）。

| 参数 | 类型 | 说明 |
|------|------|------|
| (无) | - | - |
| **返回值** | `boolean` | 是否授权成功 |

#### `open_settings_window`
打开设置窗口。

#### `close_overlay`
关闭遮罩窗口并重置截屏状态。

#### `update_hotkey`
更新全局快捷键（注销旧快捷键，注册新快捷键）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `hotkey` | `string` | 新快捷键字符串，如 `"Alt+Q"` |
| **返回值** | `boolean` | 是否更新成功 |

### 7.2 Tauri Events（Rust → 前端）

Rust 通过 `emit()` 向前端窗口推送事件。

| 事件名 | 方向 | Payload 类型 | 说明 |
|--------|------|-------------|------|
| `translation-result` | Rust → result 窗口 | `TranslateResult` | 翻译成功，推送结果 |
| `translation-error` | Rust → result 窗口 | `TranslateError` | 翻译失败，推送错误信息 |
| `capture-started` | Rust → overlay 窗口 | `ScreenshotData` | 截屏完成，通知 overlay 渲染 |

### 7.3 TypeScript 类型定义

```typescript
// types/translate.ts
interface TranslateResult {
  translation: string;       // 翻译结果文本
  sourceLanguage: string;    // 源语言标识（如 "EN", "JA"）
  targetLanguage: string;    // 目标语言（如 "中文"）
}

interface TranslateError {
  code: string;              // 错误码
  message: string;           // 用户友好的错误信息
  action?: 'settings' | 'retry';  // 建议的用户操作
}

interface ScreenshotData {
  base64: string;
  logicalWidth: number;
  logicalHeight: number;
  scaleFactor: number;
}

// types/config.ts
interface AppConfig {
  apiKey: string;
  endpoint: string;          // 默认 "https://api.openai.com/v1"
  model: string;             // 默认 "gpt-4o"
  targetLanguage: 'zh' | 'en';
  hotkey: string;            // 默认 "Alt+Q"
  proxy?: ProxyConfig;
  onboardingCompleted: boolean;
}

interface ProxyConfig {
  protocol: 'http' | 'socks5';
  url: string;               // 如 "http://127.0.0.1:7890"
}
```

---

## 八、 数据存储设计

### 8.1 存储方案

使用 `tauri-plugin-store` 插件，以 JSON 文件形式存储在用户应用数据目录下。

| 平台 | 存储路径 |
|------|---------|
| macOS | `~/Library/Application Support/com.visiontrans.app/config.json` |
| Windows | `%APPDATA%\com.visiontrans.app\config.json` |

### 8.2 配置文件结构

```json
{
  "apiKey": "sk-xxxxxxxxxxxxxxxx",
  "endpoint": "https://api.openai.com/v1",
  "model": "gpt-4o",
  "targetLanguage": "zh",
  "hotkey": "Alt+Q",
  "proxy": {
    "protocol": "http",
    "url": "http://127.0.0.1:7890"
  },
  "onboardingCompleted": true
}
```

### 8.3 配置默认值

```typescript
const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  targetLanguage: 'zh',
  hotkey: 'Alt+Q',
  proxy: undefined,
  onboardingCompleted: false,
};
```

### 8.4 数据生命周期

| 数据类型 | 存储位置 | 生命周期 | 说明 |
|---------|---------|---------|------|
| 用户配置 | 磁盘 JSON 文件 | 持久化 | 跨会话保留 |
| 截图数据 | Rust 内存 (`AppState`) | 单次操作 | 涂抹完成后清除 |
| 裁剪图片 | 前端 Canvas 内存 | 单次操作 | 发送给 Rust 后释放 |
| 翻译结果 | 前端组件 state | 单次操作 | 卡片关闭后释放 |
| LLM API 响应 | Rust 内存 | 单次操作 | 推送给前端后释放 |

> ⚠️ **隐私设计**：截图和裁剪图片数据仅存在于内存中，不写入磁盘，用完即焚。

---

## 九、 跨平台适配策略

### 9.1 平台差异矩阵

| 功能点 | macOS | Windows | 适配策略 |
|--------|-------|---------|---------|
| 全局快捷键 | `Option+Q` | `Alt+Q` | Tauri 插件自动映射 `Alt` ↔ `Option` |
| 屏幕截图 | 需要"屏幕录制"权限 | 无需特殊权限 | `#[cfg(target_os)]` 条件编译 |
| 权限检测 | `CGPreflightScreenCaptureAccess` | 不需要 | macOS 专属模块 |
| WebView 引擎 | WKWebView (系统内置) | WebView2 (通常已预装) | Windows 需检测 WebView2 Runtime |
| 系统托盘 | 菜单栏图标 | 通知区域图标 | Tauri 统一 API |
| 窗口置顶 | `NSWindow.level` | `HWND_TOPMOST` | Tauri `always_on_top` 属性 |
| HiDPI | Retina (2x) | 100%/125%/150%/200% 等 | 通过 `scale_factor` 动态适配 |
| 安装包格式 | `.dmg` | `.msi` / `.exe` (NSIS) | Tauri 内置打包工具 |

### 9.2 macOS 特殊处理

#### 屏幕录制权限流程

```
应用启动
  │
  ├─ 检测 onboardingCompleted?
  │   ├─ false → 打开 Onboarding 窗口 → PermissionStep
  │   └─ true  → 正常运行
  │
  ├─ 用户按下快捷键
  │   ├─ check_screen_recording_permission()
  │   │   ├─ true  → 正常截屏
  │   │   └─ false → 弹出提示对话框
  │   │              ├─ "VisionTrans 需要屏幕录制权限才能工作"
  │   │              ├─ [打开系统设置] → 跳转到 隐私与安全性 → 屏幕录制
  │   │              └─ [取消]
```

#### Info.plist 配置

```xml
<key>NSScreenCaptureUsageDescription</key>
<string>VisionTrans 需要屏幕录制权限来截取屏幕内容进行翻译</string>
```

### 9.3 Windows 特殊处理

#### WebView2 Runtime 检测

```rust
#[cfg(target_os = "windows")]
fn check_webview2_runtime() -> bool {
    // 检测注册表中是否存在 WebView2 Runtime
    // HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}
}
```

Tauri v2 的 NSIS 安装器会自动检测并引导安装 WebView2 Runtime（如果缺失）。

---

## 十、 性能优化策略

### 10.1 关键路径性能目标

| 阶段 | 目标耗时 | 优化手段 |
|------|---------|---------|
| 快捷键 → 截屏完成 | ≤ 100ms | Rust 原生 API 直接调用，避免 IPC 开销 |
| 截屏 → 遮罩窗口显示 | ≤ 100ms | 窗口创建与截图并行；PNG 压缩使用快速模式 |
| 涂抹绘制帧率 | ≥ 60fps | Canvas 2D 直接绘制，避免 React 重渲染 |
| 松手 → 图片裁剪完成 | ≤ 50ms | Canvas `getImageData` + `toDataURL` |
| 裁剪图片 → LLM 响应 | ≤ 3s | 取决于网络和 LLM 服务，本地处理 ≤ 500ms |

### 10.2 截图传输优化

全屏截图的 Base64 数据量较大（2-5MB），需要优化传输：

1. **PNG 压缩级别**：使用 `image` crate 的快速压缩模式（`CompressionType::Fast`），牺牲少量压缩率换取编码速度
2. **避免重复编码**：截图在 Rust 端编码一次 Base64，前端直接使用
3. **内存及时释放**：overlay 窗口关闭后，立即清除 `AppState.last_screenshot`

### 10.3 Canvas 绘制优化

```typescript
// 使用 requestAnimationFrame 节流涂抹绘制
const onMouseMove = (e: React.MouseEvent) => {
  if (!isDrawing.current) return;
  pendingPoint.current = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };

  if (!rafId.current) {
    rafId.current = requestAnimationFrame(() => {
      // 批量绘制累积的点
      drawPoints();
      rafId.current = null;
    });
  }
};
```

### 10.4 后台内存优化

| 状态 | 目标内存 | 策略 |
|------|---------|------|
| 后台常驻（空闲） | ≤ 30MB | 仅保留 Rust 进程 + 隐藏的 main 窗口 |
| 截屏/涂抹中 | ≤ 100MB | 截图数据 + overlay 窗口 WebView |
| 翻译结果展示中 | ≤ 50MB | result 窗口 WebView（截图数据已释放） |

---

## 十一、 安全与隐私设计

### 11.1 数据安全

| 安全措施 | 说明 |
|---------|------|
| **截图不落盘** | 截图数据仅存在于内存中，不写入磁盘文件 |
| **API Key 本地存储** | API Key 存储在用户本地应用数据目录，不上传到任何服务器 |
| **HTTPS 传输** | 所有 LLM API 调用均通过 HTTPS 加密传输 |
| **最小数据传输** | 仅将用户涂抹区域的裁剪图片发送给 LLM，而非全屏截图 |
| **内存及时清理** | 每次翻译完成后，内存中的截图和裁剪数据立即释放 |

### 11.2 API Key 安全

```typescript
// 设置页面中 API Key 输入框使用 password 类型
<input type="password" value={apiKey} onChange={...} />

// 显示时仅展示前4位和后4位
function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
```

### 11.3 Tauri v2 权限能力声明 (`capabilities/default.json`)

```json
{
  "identifier": "default",
  "description": "VisionTrans default capabilities",
  "windows": ["main", "overlay", "result", "settings", "onboarding"],
  "permissions": [
    "core:default",
    "core:window:allow-create",
    "core:window:allow-close",
    "core:window:allow-set-size",
    "core:window:allow-set-position",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-focus",
    "global-shortcut:default",
    "store:default",
    "clipboard-manager:allow-write-text"
  ]
}
```

---

## 十二、 构建与发布

### 12.1 开发环境要求

| 工具 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | ≥ 18 | 前端构建 |
| pnpm | ≥ 8 | 包管理器（推荐） |
| Rust | ≥ 1.75 | 后端编译 |
| Tauri CLI | v2 | `cargo install tauri-cli --version "^2"` |
| Xcode CLT | 最新版 | macOS 编译必需 |
| Visual Studio Build Tools | 2022 | Windows 编译必需 |

### 12.2 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm tauri dev

# 构建生产包
pnpm tauri build

# 仅构建前端
pnpm build

# Rust 代码检查
cd src-tauri && cargo clippy
```

### 12.3 构建产物

| 平台 | 产物格式 | 预估体积 | 说明 |
|------|---------|---------|------|
| macOS | `.dmg` + `.app` | ~8-12MB | 包含 Universal Binary (x86_64 + aarch64) |
| Windows | `.msi` + `.exe` (NSIS) | ~6-10MB | 不含 WebView2 Runtime |

### 12.4 CI/CD 建议

```yaml
# GitHub Actions 示例
name: Build & Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install
      - uses: tauri-apps/tauri-action@v0
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'VisionTrans ${{ github.ref_name }}'
          releaseBody: 'See CHANGELOG.md for details.'
          releaseDraft: true
```

---

## 十三、 开发计划与里程碑

### 13.1 开发阶段划分

```
Phase 1: 核心链路 (P0)                    预计 2 周
├── 项目脚手架搭建 (Tauri v2 + React + TS)
├── 全局快捷键注册与监听
├── 屏幕截图服务 (多屏 + HiDPI)
├── 全屏遮罩窗口创建
├── Canvas 涂抹交互 (马克笔模式)
├── Canvas 矩形框选
├── 图像裁剪 (最小外接矩形)
├── LLM API 客户端 (OpenAI 兼容格式)
└── 翻译结果悬浮卡片

Phase 2: 基础配置 (P1)                    预计 1 周
├── 设置页面 (API Key / Endpoint / 模型 / 语言 / 快捷键 / 代理)
├── 配置持久化 (tauri-plugin-store)
├── 系统托盘 (图标 + 右键菜单)
├── 单例模式 (tauri-plugin-single-instance)
└── 一键复制翻译结果

Phase 3: 体验优化 (P2)                    预计 1 周
├── 首次启动引导 (Onboarding)
├── macOS 屏幕录制权限检测与引导
├── 异常处理与错误提示 (全部场景覆盖)
├── 卡片智能定位 & 拖拽移动
├── Loading 动画
└── 卡片出现/消失动画

Phase 4: 测试与发布                        预计 1 周
├── macOS 11+ 兼容性测试
├── Windows 10/11 兼容性测试
├── HiDPI / 多屏场景测试
├── 性能指标验证
├── 安装包体积优化
└── 构建 & 发布 CI/CD
```

### 13.2 里程碑

| 里程碑 | 时间节点 | 交付物 |
|--------|---------|--------|
| **M1: 核心链路跑通** | 第 2 周末 | 快捷键 → 截屏 → 涂抹 → LLM 翻译 → 结果展示，端到端可用 |
| **M2: 功能完整** | 第 3 周末 | 设置页面、系统托盘、单例模式全部就绪 |
| **M3: 体验完善** | 第 4 周末 | Onboarding、异常处理、动画效果全部完成 |
| **M4: v1.0 发布** | 第 5 周末 | 双平台测试通过，构建产物就绪，可对外发布 |

### 13.3 技术风险与应对

| 风险 | 影响 | 应对方案 |
|------|------|---------|
| Tauri v2 全屏无边框窗口在某些 macOS 版本上有兼容问题 | 遮罩层可能无法完美覆盖屏幕 | 提前在 macOS 11/12/13/14 上测试；备选方案：使用 `NSWindow` 原生 API |
| `xcap` 截图库在特定 Windows 版本上截图失败 | 无法截屏 | 备选方案：使用 Windows `BitBlt` API 直接截图 |
| 大尺寸截图 Base64 传输导致 IPC 延迟 | 遮罩窗口显示慢 | 优化 PNG 压缩；考虑使用共享内存或临时文件传输 |
| LLM API 响应慢导致用户体验差 | 等待时间过长 | 显示 Loading 动画 + 超时提示；后续版本考虑流式输出 |
| macOS 屏幕录制权限授予后需要重启应用 | 用户体验中断 | 在 Onboarding 中明确提示；检测到权限变更后自动重新初始化 |
