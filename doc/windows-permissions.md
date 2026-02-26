# Windows Permissions & Security Guide

[中文版本](#中文版本) | [English Version](#english-version)

---

<a id="english-version"></a>

## English Version

VisionTrans on Windows generally requires fewer manual permission steps than macOS. This guide covers common security prompts and setup issues.

### 🛡️ Windows SmartScreen — "Windows protected your PC"

When running VisionTrans for the first time, Windows SmartScreen may show a warning because the app is not signed with a Microsoft-verified certificate.

#### How to Bypass

1. When you see the SmartScreen dialog: *"Windows protected your PC"*
2. Click **More info** (the small text link)
3. Click **Run anyway**
4. You only need to do this once

> 💡 This is a standard warning for unsigned applications and does not indicate malware.

#### Alternative: Unblock via Properties

1. Right-click on `VisionTrans_x.x.x_x64-setup.exe`
2. Select **Properties**
3. At the bottom of the **General** tab, check ✅ **Unblock**
4. Click **Apply** → **OK**
5. Run the installer again

---

### 🔐 Screen Capture — No Special Permission Needed

Unlike macOS, Windows does **not** require special screen recording permissions. VisionTrans can capture the screen immediately after installation.

---

### 🌐 Windows Firewall

On first launch, Windows Firewall may prompt you to allow network access:

1. A dialog will appear: *"Windows Defender Firewall has blocked some features of this app"*
2. Check ✅ **Private networks** (and optionally **Public networks**)
3. Click **Allow access**

This is needed for VisionTrans to communicate with LLM APIs (OpenAI, Ollama, Bedrock, etc.).

---

### 🖥️ WebView2 Runtime

VisionTrans uses Microsoft Edge WebView2 for its UI. This is pre-installed on Windows 10 (version 1803+) and Windows 11.

**If the app fails to start with a blank window:**
- Download and install [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) from Microsoft
- Restart VisionTrans after installation

---

### ⚙️ Antivirus Software

Some third-party antivirus software may flag VisionTrans as suspicious because it:
- Captures screen content
- Makes network requests to external APIs
- Is not signed with a commercial code signing certificate

**If your antivirus blocks VisionTrans:**
1. Add VisionTrans to your antivirus **exclusion/whitelist**
2. The default installation path is: `C:\Users\<username>\AppData\Local\VisionTrans\`
3. Or: `C:\Program Files\VisionTrans\` (if installed for all users)

---

### 🖥️ Supported Windows Versions

| Windows Version | Status |
|----------------|--------|
| Windows 10 (1803+) | ✅ Supported |
| Windows 11 | ✅ Supported |
| Windows 10 (older than 1803) | ❌ Not supported (WebView2 required) |

---

<a id="中文版本"></a>

## 中文版本

VisionTrans 在 Windows 上通常比 macOS 需要更少的手动权限设置。本指南涵盖常见的安全提示和设置问题。

### 🛡️ Windows SmartScreen — "Windows 已保护你的电脑"

首次运行 VisionTrans 时，Windows SmartScreen 可能会显示警告，因为应用未使用 Microsoft 验证的证书签名。

#### 如何绕过

1. 当看到 SmartScreen 对话框：*"Windows 已保护你的电脑"*
2. 点击 **更多信息**（小字链接）
3. 点击 **仍要运行**
4. 只需操作一次

> 💡 这是未签名应用的标准警告，不代表存在恶意软件。

#### 替代方法：通过属性解除阻止

1. 右键点击 `VisionTrans_x.x.x_x64-setup.exe`
2. 选择 **属性**
3. 在 **常规** 选项卡底部，勾选 ✅ **解除锁定**
4. 点击 **应用** → **确定**
5. 重新运行安装程序

---

### 🔐 屏幕截图 — 无需特殊权限

与 macOS 不同，Windows **不需要** 特殊的屏幕录制权限。VisionTrans 安装后即可立即截取屏幕。

---

### 🌐 Windows 防火墙

首次启动时，Windows 防火墙可能会提示允许网络访问：

1. 弹出对话框：*"Windows Defender 防火墙已阻止此应用的某些功能"*
2. 勾选 ✅ **专用网络**（可选勾选 **公用网络**）
3. 点击 **允许访问**

VisionTrans 需要网络访问来与 LLM API（OpenAI、Ollama、Bedrock 等）通信。

---

### 🖥️ WebView2 运行时

VisionTrans 使用 Microsoft Edge WebView2 作为 UI 引擎。Windows 10（1803 版本以上）和 Windows 11 已预装。

**如果应用启动后显示空白窗口：**
- 从 Microsoft 下载并安装 [WebView2 Runtime](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/)
- 安装后重新启动 VisionTrans

---

### ⚙️ 杀毒软件

部分第三方杀毒软件可能会将 VisionTrans 标记为可疑，因为它：
- 截取屏幕内容
- 向外部 API 发送网络请求
- 未使用商业代码签名证书

**如果杀毒软件阻止了 VisionTrans：**
1. 将 VisionTrans 添加到杀毒软件的 **排除/白名单**
2. 默认安装路径：`C:\Users\<用户名>\AppData\Local\VisionTrans\`
3. 或：`C:\Program Files\VisionTrans\`（如果为所有用户安装）

---

### 🖥️ 支持的 Windows 版本

| Windows 版本 | 支持状态 |
|-------------|---------|
| Windows 10 (1803+) | ✅ 支持 |
| Windows 11 | ✅ 支持 |
| Windows 10 (低于 1803) | ❌ 不支持（需要 WebView2） |

---

### 💡 提示

- VisionTrans 是一个 **常驻系统托盘** 的应用，关闭窗口不会退出程序
- 截图数据 **仅存在于内存中**，不会写入磁盘
- 如果遇到任何问题，欢迎在 [GitHub Issues](https://github.com/11zhouxuan/VisionTrans/issues) 中反馈