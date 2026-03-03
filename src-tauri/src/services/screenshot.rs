use base64::Engine;
use image::ImageEncoder;
use xcap::Monitor;

use crate::errors::AppError;
use crate::state::ScreenshotData;

/// Capture the screen and encode to PNG base64
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

    // Encode PNG directly to memory (no file write needed)
    let t_png = std::time::Instant::now();
    let mut png_buf = Vec::with_capacity(image.as_raw().len() / 4);
    {
        let encoder = image::codecs::png::PngEncoder::new_with_quality(
            std::io::Cursor::new(&mut png_buf),
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
    eprintln!("[perf] PNG encode: {:?} ({} KB)", t_png.elapsed(), png_buf.len() / 1024);

    // Base64 encode
    let t_b64 = std::time::Instant::now();
    let base64 = base64::engine::general_purpose::STANDARD.encode(&png_buf);
    eprintln!("[perf] Base64: {:?}", t_b64.elapsed());

    let t_total = t0.elapsed();
    eprintln!("[perf] Total screenshot: {:?}", t_total);

    let scale_factor = target_monitor
        .scale_factor()
        .map(|f| f as f64)
        .unwrap_or(1.0);
    let logical_width = (image.width() as f64 / scale_factor) as u32;
    let logical_height = (image.height() as f64 / scale_factor) as u32;

    Ok(ScreenshotData {
        base64,
        file_path: String::new(),
        logical_width,
        logical_height,
        scale_factor,
    })
}