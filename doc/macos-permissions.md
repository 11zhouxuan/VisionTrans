# macOS Permissions & Security Guide

[中文版本](#中文版本) | [English Version](#english-version)

---

<a id="english-version"></a>

## English Version

VisionTrans requires specific macOS permissions to function properly. This guide covers all security-related setup steps.

### 🛡️ Gatekeeper — "App Can't Be Opened" / "Unidentified Developer"

Since VisionTrans is not signed with an Apple Developer certificate, macOS Gatekeeper may block the app from opening.

#### Method 1: Right-click to Open (Recommended)

1. Open **Finder** → navigate to **Applications**
2. **Right-click** (or Control+click) on **VisionTrans.app**
3. Select **Open** from the context menu
4. In the dialog that appears, click **Open**
5. You only need to do this once — subsequent launches will work normally

#### Method 2: System Settings

1. Try to open VisionTrans normally (it will be blocked)
2. Go to **System Settings** → **Privacy & Security**
3. Scroll down to find the message: *"VisionTrans" was blocked from use because it is not from an identified developer*
4. Click **Open Anyway**
5. Enter your password to confirm

#### Method 3: Terminal Command

```bash
# Remove the quarantine attribute
sudo xattr -cr /Applications/VisionTrans.app
```

> ⚠️ After using any method above, you may need to restart VisionTrans.

---

### 🔐 Screen Recording Permission

VisionTrans needs Screen Recording permission to capture screen content for translation.

#### Steps

1. **Open System Settings**
   - Click  → **System Settings**
   - Or search "Privacy" in Spotlight (`Cmd+Space`)

2. **Navigate to Screen Recording**
   - **System Settings** → **Privacy & Security** → **Screen Recording**

3. **Add VisionTrans**
   - Click the 🔒 lock icon at bottom-left, enter your password
   - Click **+** and find **VisionTrans** in the application list
   - Or simply open VisionTrans and press `Option+Q` — the system will prompt for authorization

4. **Confirm**
   - Ensure the toggle next to VisionTrans is ✅ ON
   - If prompted to restart, quit and reopen VisionTrans

#### Troubleshooting

**Still can't capture after granting permission:**
- Fully quit VisionTrans (tray icon → right-click → Quit), then reopen
- Verify the permission toggle is ON in System Settings
- Reset permission and re-authorize:
  ```bash
  tccutil reset ScreenCapture com.visiontrans.desktop
  ```

**VisionTrans not showing in permission list:**
- Make sure VisionTrans has been launched at least once
- Press `Option+Q` to trigger the authorization dialog

**macOS Sonoma (14) / Sequoia (15):**
- These versions may periodically ask to re-confirm Screen Recording permission
- If VisionTrans suddenly stops capturing, check if the permission was auto-disabled

---

### 🔓 Other Permissions

**Accessibility (Optional):**
If the global hotkey doesn't work, you may need to grant Accessibility permission:
- **System Settings** → **Privacy & Security** → **Accessibility**
- Add VisionTrans and enable the toggle

**Network Access:**
macOS may show a firewall prompt on first network access. Click **Allow**.

---

### 🖥️ Supported macOS Versions

| macOS Version | Status |
|--------------|--------|
| macOS 11 (Big Sur) | ✅ Supported |
| macOS 12 (Monterey) | ✅ Supported |
| macOS 13 (Ventura) | ✅ Supported |
| macOS 14 (Sonoma) | ✅ Supported |
| macOS 15 (Sequoia) | ✅ Supported |

---

<a id="中文版本"></a>

## 中文版本

VisionTrans 需要特定的 macOS 权限才能正常工作。本指南涵盖所有安全相关的设置步骤。

### 🛡️ Gatekeeper — "无法打开应用" / "未验证的开发者"

由于 VisionTrans 未使用 Apple 开发者证书签名，macOS Gatekeeper 可能会阻止应用打开。

#### 方法一：右键打开（推荐）

1. 打开 **访达 (Finder)** → 进入 **应用程序**
2. **右键点击**（或 Control+点击）**VisionTrans.app**
3. 在弹出菜单中选择 **打开**
4. 在弹出的对话框中点击 **打开**
5. 只需操作一次，之后可以正常启动

#### 方法二：系统设置

1. 尝试正常打开 VisionTrans（会被阻止）
2. 前往 **系统设置** → **隐私与安全性**
3. 向下滚动找到提示：*"VisionTrans" 因为不是来自已识别的开发者而被阻止使用*
4. 点击 **仍要打开**
5. 输入密码确认

#### 方法三：终端命令

```bash
# 移除隔离属性
sudo xattr -cr /Applications/VisionTrans.app
```

> ⚠️ 使用以上任何方法后，可能需要重新启动 VisionTrans。

---

### 🔐 屏幕录制权限

VisionTrans 需要屏幕录制权限才能截取屏幕内容进行翻译。

#### 设置步骤

1. **打开系统设置**
   - 点击左上角  → **系统设置**
   - 或通过 Spotlight (`Cmd+Space`) 搜索 "隐私"

2. **导航到屏幕录制**
   - **系统设置** → **隐私与安全性** → **屏幕录制**

3. **添加 VisionTrans**
   - 点击左下角的 🔒 锁图标，输入密码解锁
   - 点击 **+** 按钮，在应用程序列表中找到 **VisionTrans**
   - 或者直接打开 VisionTrans 并按 `Option+Q`，系统会自动弹出授权请求

4. **确认授权**
   - 确保 VisionTrans 旁边的开关是 ✅ 打开状态
   - 如果提示需要重启应用，请退出并重新打开 VisionTrans

#### 常见问题

**授权后仍然无法截图：**
- 完全退出 VisionTrans（托盘图标右键 → 退出），然后重新打开
- 回到系统设置确认权限开关已打开
- 重置权限后重新授权：
  ```bash
  tccutil reset ScreenCapture com.visiontrans.desktop
  ```

**在权限列表中找不到 VisionTrans：**
- 确保 VisionTrans 已经至少运行过一次
- 按一次 `Option+Q` 触发授权对话框

**macOS Sonoma (14) / Sequoia (15)：**
- 这些版本可能会定期要求重新确认屏幕录制权限
- 如果 VisionTrans 突然无法截图，请检查权限是否被系统自动关闭

---

### 🔓 其他权限

**辅助功能（可选）：**
如果全局快捷键无法正常工作，可能需要授予辅助功能权限：
- **系统设置** → **隐私与安全性** → **辅助功能**
- 添加 VisionTrans 并打开开关

**网络访问：**
macOS 可能会在首次联网时弹出防火墙提示，请选择 **允许**。

---

### 🖥️ 支持的 macOS 版本

| macOS 版本 | 支持状态 |
|-----------|---------|
| macOS 11 (Big Sur) | ✅ 支持 |
| macOS 12 (Monterey) | ✅ 支持 |
| macOS 13 (Ventura) | ✅ 支持 |
| macOS 14 (Sonoma) | ✅ 支持 |
| macOS 15 (Sequoia) | ✅ 支持 |

---

### 💡 提示

- VisionTrans 是一个 **常驻托盘** 的应用，关闭窗口不会退出程序
- 截图数据 **仅存在于内存中**，不会写入磁盘，保护你的隐私
- 如果遇到任何权限问题，欢迎在 [GitHub Issues](https://github.com/11zhouxuan/VisionTrans/issues) 中反馈