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
    eprintln!("[perf] Screen capture: {:?}", t_capture);

    // Write JPEG to temp file (much faster than base64 IPC)
    let temp_path = std::env::temp_dir().join("visiontrans-screenshot.jpg");
    write_jpeg_to_file(&image, &temp_path)?;

    let t_encode = t0.elapsed();
    eprintln!("[perf] JPEG write to file: {:?} (total: {:?})", t_encode - t_capture, t_encode);

    // Calculate logical dimensions
    let scale_factor = target_monitor
        .scale_factor()
        .map(|f| f as f64)
        .unwrap_or(1.0);
    let logical_width = (image.width() as f64 / scale_factor) as u32;
    let logical_height = (image.height() as f64 / scale_factor) as u32;

    Ok(ScreenshotData {
        file_path: temp_path.to_string_lossy().to_string(),
        logical_width,
        logical_height,
        scale_factor,
    })
}

fn write_jpeg_to_file(image: &image::RgbaImage, path: &std::path::Path) -> Result<(), AppError> {
    // Convert RGBA to RGB for JPEG
    let rgb_image: image::RgbImage = image::DynamicImage::ImageRgba8(image.clone()).to_rgb8();

    let file = std::fs::File::create(path)
        .map_err(|e| AppError::CaptureError(format!("Failed to create temp file: {}", e)))?;
    let mut writer = std::io::BufWriter::new(file);

    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, 85);
    encoder
        .write_image(
            rgb_image.as_raw(),
            rgb_image.width(),
            rgb_image.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| AppError::CaptureError(e.to_string()))?;

    Ok(())
}