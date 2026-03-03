use base64::Engine;
use image::ImageEncoder;
use xcap::Monitor;

use crate::errors::AppError;
use crate::state::ScreenshotData;

/// Capture the screen where the mouse cursor is currently located
pub fn capture_current_screen() -> Result<ScreenshotData, AppError> {
    let t0 = std::time::Instant::now();

    // Get all monitors
    let monitors = Monitor::all().map_err(|e| AppError::CaptureError(e.to_string()))?;

    if monitors.is_empty() {
        return Err(AppError::NoMonitorFound);
    }

    // For MVP, capture the primary monitor (first one)
    let target_monitor = &monitors[0];

    // Capture the screen image
    let image = target_monitor
        .capture_image()
        .map_err(|e| AppError::CaptureError(e.to_string()))?;

    let t_capture = t0.elapsed();
    eprintln!("[perf] Screen capture: {:?} ({}x{})", t_capture, image.width(), image.height());

    // Write JPEG to temp file AND encode to base64
    // File write is for fast asset:// loading, base64 is fallback
    let (width, height) = (image.width(), image.height());
    let rgba_bytes = image.as_raw();

    // Convert RGBA to RGB without cloning
    let t_conv = std::time::Instant::now();
    let mut rgb_bytes = Vec::with_capacity((width * height * 3) as usize);
    for chunk in rgba_bytes.chunks_exact(4) {
        rgb_bytes.push(chunk[0]);
        rgb_bytes.push(chunk[1]);
        rgb_bytes.push(chunk[2]);
    }
    eprintln!("[perf] RGBA→RGB conversion: {:?}", t_conv.elapsed());

    // Encode JPEG to memory buffer
    let t_jpeg = std::time::Instant::now();
    let mut jpeg_buf = Vec::with_capacity(rgb_bytes.len() / 10);
    {
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
            std::io::Cursor::new(&mut jpeg_buf),
            70,
        );
        encoder
            .write_image(&rgb_bytes, width, height, image::ExtendedColorType::Rgb8)
            .map_err(|e| AppError::CaptureError(e.to_string()))?;
    }
    eprintln!("[perf] JPEG encode: {:?} ({} bytes)", t_jpeg.elapsed(), jpeg_buf.len());

    // Write to temp file (for asset:// protocol loading)
    let t_file = std::time::Instant::now();
    let temp_path = std::env::temp_dir().join("visiontrans-screenshot.jpg");
    std::fs::write(&temp_path, &jpeg_buf)
        .map_err(|e| AppError::CaptureError(format!("Failed to write temp file: {}", e)))?;
    eprintln!("[perf] File write: {:?}", t_file.elapsed());

    // Base64 encode (for IPC fallback)
    let t_b64 = std::time::Instant::now();
    let base64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_buf);
    eprintln!("[perf] Base64 encode: {:?}", t_b64.elapsed());

    let t_total = t0.elapsed();
    eprintln!("[perf] Total screenshot: {:?}", t_total);

    // Calculate logical dimensions
    let scale_factor = target_monitor
        .scale_factor()
        .map(|f| f as f64)
        .unwrap_or(1.0);
    let logical_width = (width as f64 / scale_factor) as u32;
    let logical_height = (height as f64 / scale_factor) as u32;

    Ok(ScreenshotData {
        base64,
        file_path: temp_path.to_string_lossy().to_string(),
        logical_width,
        logical_height,
        scale_factor,
    })
}