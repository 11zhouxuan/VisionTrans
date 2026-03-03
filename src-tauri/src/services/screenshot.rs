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

    // Fast JPEG encoding: manually convert RGBA→RGB without cloning the entire image
    let base64 = encode_image_fast(&image)?;

    let t_encode = t0.elapsed();
    eprintln!("[perf] JPEG encode + base64: {:?} (total: {:?})", t_encode - t_capture, t_encode);

    // Calculate logical dimensions
    let scale_factor = target_monitor
        .scale_factor()
        .map(|f| f as f64)
        .unwrap_or(1.0);
    let logical_width = (image.width() as f64 / scale_factor) as u32;
    let logical_height = (image.height() as f64 / scale_factor) as u32;

    Ok(ScreenshotData {
        base64,
        logical_width,
        logical_height,
        scale_factor,
    })
}

/// Fast JPEG encoding: convert RGBA→RGB without cloning, then encode JPEG at quality 70
fn encode_image_fast(image: &image::RgbaImage) -> Result<String, AppError> {
    let (width, height) = (image.width(), image.height());
    let rgba_bytes = image.as_raw();

    // Convert RGBA to RGB in-place without cloning the entire DynamicImage
    // This avoids the ~60MB clone that was causing 3s delay
    let mut rgb_bytes = Vec::with_capacity((width * height * 3) as usize);
    for chunk in rgba_bytes.chunks_exact(4) {
        rgb_bytes.push(chunk[0]); // R
        rgb_bytes.push(chunk[1]); // G
        rgb_bytes.push(chunk[2]); // B
    }

    // Encode JPEG with lower quality for speed (70 is still good for screenshots)
    let mut jpeg_buf = Vec::with_capacity(rgb_bytes.len() / 10);
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
        std::io::Cursor::new(&mut jpeg_buf),
        70,
    );
    encoder
        .write_image(&rgb_bytes, width, height, image::ExtendedColorType::Rgb8)
        .map_err(|e| AppError::CaptureError(e.to_string()))?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&jpeg_buf))
}