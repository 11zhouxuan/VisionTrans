/// Check macOS screen recording permission
#[cfg(target_os = "macos")]
pub fn check_screen_recording_permission() -> bool {
    unsafe {
        // CGPreflightScreenCaptureAccess() - macOS 10.15+
        extern "C" {
            fn CGPreflightScreenCaptureAccess() -> bool;
        }
        CGPreflightScreenCaptureAccess()
    }
}

/// Request macOS screen recording permission
#[cfg(target_os = "macos")]
pub fn request_screen_recording_permission() -> bool {
    unsafe {
        extern "C" {
            fn CGRequestScreenCaptureAccess() -> bool;
        }
        CGRequestScreenCaptureAccess()
    }
}

/// On non-macOS platforms, always return true
#[cfg(not(target_os = "macos"))]
pub fn check_screen_recording_permission() -> bool {
    true
}

#[cfg(not(target_os = "macos"))]
pub fn request_screen_recording_permission() -> bool {
    true
}
