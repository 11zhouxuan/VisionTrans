# Skill: Tauri v2 macOS NSWindow 操作陷阱

## 概述
在 Tauri v2 中操作 macOS 原生 NSWindow 时，有许多容易踩的坑。本文档总结了实际开发中遇到的问题和解决方案。

## 陷阱1：从后台线程调用 NSWindow 方法会崩溃

```rust
// ❌ 崩溃！NSWindow 方法必须在主线程调用
std::thread::spawn(move || {
    let ptr = window.ns_window().unwrap(); // 可能崩溃
    unsafe { msg_send![ptr, setLevel: 1000_i64]; } // 崩溃
});

// ✅ 正确：先获取指针，再通过 run_on_main_thread 操作
let ns_window_addr = window.ns_window().map(|p| p as usize).unwrap_or(0);
app.run_on_main_thread(move || {
    if ns_window_addr != 0 {
        unsafe {
            let ns_window = ns_window_addr as *mut AnyObject;
            let _: () = msg_send![ns_window, setLevel: 1000_i64];
        }
    }
});
```

## 陷阱2：ns_window() 返回 TaoWindow，不是标准 NSWindow

```
[overlay] ns_window() returned object of class: TaoWindow
```
- `TaoWindow` 是 `tao` 库的 NSWindow 子类
- 大部分 NSWindow 方法可以正常使用
- 但某些行为可能被 tao 覆盖（如 `makeKeyAndOrderFront:`）

## 陷阱3：Tauri 的 show() 会重置 NSWindow 属性

```rust
// ❌ 属性在 show() 后被重置
set_ns_window_props(&window); // 设置 level=2000, behavior=337
window.show(); // Tauri 内部重置了属性！

// ✅ 在 show() 之后设置属性
window.show();
window.set_always_on_top(true);
// 然后通过 run_on_main_thread 设置原生属性
```

## 陷阱4：NSRect 的 Encode trait

```rust
// ❌ 自定义 NSRect 没有实现 Encode trait
#[repr(C)]
struct NSRect { x: f64, y: f64, w: f64, h: f64 }
let frame: NSRect = msg_send![window, frame]; // 编译错误！

// ✅ 使用 objc2-foundation 的 NSRect，或避免使用 frame
// 改用其他方式识别窗口（如 isVisible, ns_window() 直接获取）
```

## 陷阱5：activateIgnoringOtherApps 已废弃

```rust
// ⚠️ 编译警告：deprecated
ns_app.activateIgnoringOtherApps(true);

// ✅ 使用 #[allow(deprecated)] 或改用其他方式
#[allow(deprecated)]
ns_app.activateIgnoringOtherApps(true);

// 更好的方案：设置 ActivationPolicy::Accessory 后不需要手动激活
```

## 陷阱6：通过 NSApplication.windows 搜索窗口不可靠

```rust
// ❌ lastObject 可能不是目标窗口
let windows: *mut AnyObject = msg_send![ns_app, windows];
let window: *mut AnyObject = msg_send![windows, lastObject]; // 可能是错误的窗口！

// ❌ isVisible 检查在 LSUIElement app 中会匹配到错误的隐藏窗口
let visible: Bool = msg_send![w, isVisible]; // 多个窗口可能都是 hidden

// ✅ 使用 Tauri 的 ns_window() 直接获取
let ptr = window.ns_window().unwrap();
```

## 陷阱7：requestAnimationFrame 在隐藏窗口中不触发

```typescript
// ❌ 窗口隐藏时 rAF 不会触发
requestAnimationFrame(() => {
    invoke('show_overlay_window'); // 永远不会执行！
});

// ✅ 使用 setTimeout 替代
setTimeout(() => {
    invoke('show_overlay_window');
}, 16);
```

## 陷阱8：visible_on_all_workspaces 导致透明/点击穿透

```rust
// ❌ 可能导致窗口透明和点击穿透
WebviewWindowBuilder::new(...)
    .visible_on_all_workspaces(true) // 有副作用！
    .build();

// ✅ 通过原生 API 设置 collectionBehavior
// 在 show() 之后通过 msg_send 设置
let behavior: usize = 1 | 16 | 64 | 256;
let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
```

## 陷阱9：makeKeyAndOrderFront 会激活 app

```rust
// ❌ 会激活 app，导致 Space 切换
let _: () = msg_send![ns_window, makeKeyAndOrderFront: nil];

// ✅ 在 Accessory 模式下，使用 Tauri 的 show() + set_focus()
// ActivationPolicy::Accessory 阻止了 Space 切换
window.show();
window.set_focus();
```

## 依赖配置

```toml
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
objc2-app-kit = { version = "0.3", features = [
    "NSApplication", "NSRunningApplication", "NSWindow",
    "NSColor", "NSResponder", "NSButton", "NSControl", "NSView"
] }
objc2-foundation = "0.3"
```

## 相关文件
- `src-tauri/Cargo.toml` - macOS 依赖配置
- `src-tauri/src/hotkey.rs` - NSWindow 操作示例
- `src-tauri/src/commands/window.rs` - show/close overlay