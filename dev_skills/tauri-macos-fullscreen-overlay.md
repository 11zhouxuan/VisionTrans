# Skill: Tauri macOS 全屏应用上方显示 Overlay 窗口

## 问题描述
在 macOS 上，当用户正在使用全屏应用（如全屏的 Safari、Xcode）时，Tauri 应用的截图 overlay 窗口无法显示在全屏应用之上，而是跳转到桌面 Space。

## 根本原因
macOS 全屏应用运行在独立的 Space（虚拟桌面）中。默认情况下，Tauri 创建的 `NSWindow`（实际是 `TaoWindow` 子类）只属于普通桌面空间。显示窗口时会触发 Space 切换。

## 解决方案

### 1. 设置 ActivationPolicy::Accessory（最关键）
```rust
// 在 lib.rs 的 setup 中
app.set_activation_policy(tauri::ActivationPolicy::Accessory);
```
- 这是防止 Space 切换的**最关键**一步
- Accessory 模式的 app 不在 Dock 显示，不触发 Space 切换
- 必须配合 `Info.plist` 中的 `LSUIElement = YES`

### 2. 删除所有 activateIgnoringOtherApps 调用
```rust
// ❌ 不要这样做
ns_app.activateIgnoringOtherApps(true);

// ✅ 直接用 show() + set_focus()
window.show();
window.set_focus();
```
- `activateIgnoringOtherApps` 会强制激活 app，导致 Space 切换
- 在 Accessory 模式下，`show()` + `set_focus()` 就足够了

### 3. 设置 NSWindow 属性（show 之后）
```rust
// 必须在 window.show() 之后设置，因为 Tauri 的 show() 会重置属性
let _ = window.show();
let _ = window.set_always_on_top(true);

// 通过 run_on_main_thread 设置原生属性
let ns_window_addr = window.ns_window().map(|ptr| ptr as usize).unwrap_or(0);
app.run_on_main_thread(move || {
    unsafe {
        let ns_window = ns_window_addr as *mut AnyObject;
        // Window level 2000 (kCGScreenSaverWindowLevelKey 范围)
        let _: () = msg_send![ns_window, setLevel: 2000_i64];
        // Collection behavior:
        // canJoinAllSpaces (1) | stationary (16) | ignoresCycle (64) | fullScreenAuxiliary (256)
        let behavior: usize = 1 | 16 | 64 | 256;
        let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
        let _: () = msg_send![ns_window, setIgnoresMouseEvents: false];
    }
});

let _ = window.set_focus();
```

### 4. Collection Behavior 标志说明
| 标志 | 值 | 作用 |
|------|-----|------|
| canJoinAllSpaces | 1 << 0 = 1 | 窗口出现在所有 Space（包括全屏 Space） |
| stationary | 1 << 4 = 16 | 窗口固定，不随 Mission Control 移动 |
| ignoresCycle | 1 << 6 = 64 | 不参与 Cmd+Tab 循环 |
| fullScreenAuxiliary | 1 << 8 = 256 | 允许悬浮在全屏窗口之上 |

### 5. 获取 NSWindow 指针
```rust
// 使用 Tauri v2 的 ns_window() 方法（返回 TaoWindow 指针）
match window.ns_window() {
    Ok(ptr) => {
        let ns_window = ptr as *mut AnyObject;
        // ... 设置属性
    }
    Err(e) => eprintln!("Failed to get ns_window: {}", e),
}
```
- **不要**通过 `NSApplication.windows` 数组搜索窗口（不可靠）
- **直接**使用 `window.ns_window()` 获取正确的指针

## 注意事项
- `ns_window()` 返回的是 `TaoWindow`（NSWindow 子类），不是标准 NSWindow
- 原生属性必须在 `show()` 之后设置（Tauri 的 show 会重置属性）
- 使用 `run_on_main_thread` 确保 NSWindow 操作在主线程执行
- 不要从后台线程直接调用 `ns_window()` 或 `msg_send!`（会崩溃）

## 相关文件
- `src-tauri/src/lib.rs` - ActivationPolicy 设置
- `src-tauri/src/hotkey.rs` - overlay 窗口创建和显示
- `src-tauri/src/commands/window.rs` - show/close overlay 命令
- `src-tauri/Info.plist` - LSUIElement 设置