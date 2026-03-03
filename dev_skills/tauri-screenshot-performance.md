# Skill: Tauri 截图应用性能优化

## 问题描述
Tauri 截图应用从按下快捷键到显示 overlay 窗口需要 3+ 秒，用户体验极差。

## 性能瓶颈分析

### 瓶颈1：每次新建 WebviewWindow（~1-2s）
Tauri 创建 WebviewWindow 需要初始化 WKWebView、启动 WebKit 渲染进程、加载 HTML/JS/CSS。

**解决方案：预创建窗口 + 复用**
```rust
// lib.rs setup 阶段预创建
let _window = WebviewWindowBuilder::new(&app_handle, "overlay", ...)
    .visible(false)
    .build();

// 截图时复用（不创建新窗口）
if let Some(existing) = app.get_webview_window("overlay") {
    // 复用已有窗口
    existing.set_size(...);
    app.emit("screenshot-ready", ());
    return Ok(());
}
```

### 瓶颈2：图像编码（debug 模式下 ~1-2s）
Rust 的 `image` crate 在 debug 模式下 PNG/JPEG 编码极慢（无优化）。

**解决方案：为编码依赖添加 opt-level**
```toml
# Cargo.toml
[profile.dev.package.image]
opt-level = 3

[profile.dev.package.flate2]
opt-level = 3

[profile.dev.package.miniz_oxide]
opt-level = 3

[profile.dev.package.crc32fast]
opt-level = 3
```
- 这让编码库即使在 debug 构建中也使用完全优化
- PNG 编码从 ~1.6s 降到 ~600ms（debug），release 构建 ~100ms

### 瓶颈3：Base64 IPC 传输大数据
将 ~3MB 的 base64 字符串通过 Tauri IPC 传输会卡住前端主线程。

**解决方案（理想）：临时文件 + asset:// 协议**
```rust
// 写入临时文件
let temp_path = std::env::temp_dir().join("screenshot.png");
image.save(&temp_path)?;

// 前端通过 convertFileSrc 加载
const url = convertFileSrc(data.filePath);
img.src = url;
```
注意：Tauri v2 的 asset:// 协议需要正确配置安全权限，否则会白屏。

**解决方案（可靠）：PNG 直接编码到内存 → base64**
```rust
let mut png_buf = Vec::with_capacity(image.as_raw().len() / 4);
let encoder = PngEncoder::new_with_quality(
    Cursor::new(&mut png_buf),
    CompressionType::Fast,
    FilterType::Sub,
);
encoder.write_image(image.as_raw(), width, height, Rgba8)?;
let base64 = STANDARD.encode(&png_buf);
```

### 瓶颈4：窗口显示闪烁
窗口在截图数据加载完成前就显示，导致闪烁。

**解决方案：前端控制窗口显示时机**
```typescript
// 前端：图片加载完成后才显示窗口
img.onload = () => {
    // 1. 立即绘制到 canvas（同步）
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // 2. 更新 React 状态
    setBgImage(img);
    // 3. 延迟显示窗口（让 canvas 完成绘制）
    setTimeout(() => {
        invoke('show_overlay_window');
    }, 16);
};
```

```rust
// 后端：show_overlay_window 命令
#[tauri::command]
pub async fn show_overlay_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.show()?;
        window.set_always_on_top(true)?;
        // 设置 macOS 原生属性...
        window.set_focus()?;
    }
    Ok(())
}
```

### 瓶颈5：close_overlay 销毁窗口
每次关闭 overlay 都销毁窗口，下次需要重新创建。

**解决方案：macOS 上 hide 替代 close**
```rust
#[cfg(target_os = "macos")]
{
    window.hide(); // 隐藏但保留窗口
}
#[cfg(not(target_os = "macos"))]
{
    window.close(); // 其他平台正常关闭
}
```

## 性能对比

| 环节 | 优化前 | 优化后 (debug) | 优化后 (release) |
|------|--------|---------------|-----------------|
| 屏幕截取 | ~500ms | ~500ms | ~500ms |
| 图像编码 | ~1.6s | ~600ms | ~100ms |
| 窗口创建 | ~1-2s | ~5ms (复用) | ~5ms (复用) |
| IPC 传输 | ~200ms | ~3ms (base64) | ~3ms |
| **总计** | **~3.5s** | **~1.1s** | **~600ms** |

## 关键经验
1. **预创建窗口**是最大的优化（节省 1-2s）
2. **opt-level = 3** 对编码库至关重要（debug 模式下 10-50x 差异）
3. **前端控制显示时机**消除闪烁（canvas 绘制完成后再 show）
4. **hide 替代 close** 实现窗口复用
5. `requestAnimationFrame` 在隐藏窗口中不触发，用 `setTimeout` 替代

## 相关文件
- `src-tauri/Cargo.toml` - opt-level 配置
- `src-tauri/src/services/screenshot.rs` - 截图编码
- `src-tauri/src/hotkey.rs` - 截图触发和窗口管理
- `src-tauri/src/commands/window.rs` - show/close overlay
- `src-tauri/src/lib.rs` - 窗口预创建
- `src/pages/overlay/OverlayPage.tsx` - 前端截图加载和显示