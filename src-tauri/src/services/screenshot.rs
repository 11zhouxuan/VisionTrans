use base64::Engine;
use image::ImageEncoder;
use xcap::Monitor;

use crate::errors::AppError;
use crate::state::ScreenshotData;

/// Capture the screen and write to temp file for fast display.
/// Returns ScreenshotData with file_path (for asset:// loading) and empty base64.
/// Base64 is generated lazily only when needed (for translation).
pub fn capture_current_screen() -> Result<ScreenshotData, AppError> {
    let t0 = std::time::Instant::now();

    let monitors = Monitor::all().map_err(|e| AppError::CaptureError(e.to_string()))?;
    if monitors.is_empty() {
        return Err(AppError::NoMonitorFound);
    }

    let target_monitor = &monitors[0];
    let image = target_monitor
        .capture_image()
        .map_err(|e| AppError::CaptureError(e.to_string()))?;

    let t_capture = t0.elapsed();
    eprintln!("[perf] Screen capture: {:?} ({}x{})", t_capture, image.width(), image.height());

    // Write PNG to temp file using fast compression
    // PNG with fast compression is ~1MB (similar to other screenshot tools)
    let t_png = std::time::Instant::now();
    let temp_path = std::env::temp_dir().join("visiontrans-screenshot.png");
    {
        let file = std::fs::File::create(&temp_path)
            .map_err(|e| AppError::CaptureError(format!("Failed to create temp file: {}", e)))?;
        let writer = std::io::BufWriter::new(file);
        let encoder = image::codecs::png::PngEncoder::new_with_quality(
            writer,
            image::codecs::png::CompressionType::Fast,
            image::codecs::png::FilterType::Sub,
        );
        encoder
            .write_image(
                image.as_raw(),
                image.width(),
                image.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|e| AppError::CaptureError(e.to_string()))?;
    }
    let png_size = std::fs::metadata(&temp_path).map(|m| m.len()).unwrap_or(0);
    eprintln!("[perf] PNG file write: {:?} ({} KB)", t_png.elapsed(), png_size / 1024);

    let t_total = t0.elapsed();
    eprintln!("[perf] Total screenshot: {:?}", t_total);

    let scale_factor = target_monitor
        .scale_factor()
        .map(|f| f as f64)
        .unwrap_or(1.0);
    let logical_width = (image.width() as f64 / scale_factor) as u32;
    let logical_height = (image.height() as f64 / scale_factor) as u32;

    // Also encode base64 for IPC fallback (in case asset:// doesn't work)
    let t_b64 = std::time::Instant::now();
    let png_bytes = std::fs::read(&temp_path)
        .map_err(|e| AppError::CaptureError(format!("Failed to read PNG: {}", e)))?;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
    eprintln!("[perf] Base64 encode: {:?} ({} KB)", t_b64.elapsed(), base64.len() / 1024);

    let t_total2 = t0.elapsed();
    eprintln!("[perf] Total with base64: {:?}", t_total2);

    Ok(ScreenshotData {
        base64,
        file_path: temp_path.to_string_lossy().to_string(),
        logical_width,
        logical_height,
        scale_factor,
    })
}

/// Encode a PNG file to base64 (called lazily when needed for translation)
pub fn encode_file_to_base64(path: &str) -> Result<String, AppError> {
    let bytes = std::fs::read(path)
        .map_err(|e| AppError::CaptureError(format!("Failed to read file: {}", e)))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}