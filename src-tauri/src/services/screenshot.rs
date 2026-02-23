use base64::Engine;
use image::ImageEncoder;
use std::io::Cursor;
use xcap::Monitor;

use crate::errors::AppError;
use crate::state::ScreenshotData;

/// Capture the screen where the mouse cursor is currently located
pub fn capture_current_screen() -> Result<ScreenshotData, AppError> {
    // Get all monitors
    let monitors = Monitor::all().map_err(|e| AppError::CaptureError(e.to_string()))?;

    if monitors.is_empty() {
        return Err(AppError::NoMonitorFound);
    }

    // For MVP, capture the primary monitor (first one)
    // TODO: detect cursor position and capture the correct monitor
    let target_monitor = &monitors[0];

    // Capture the screen image
    let image = target_monitor
        .capture_image()
        .map_err(|e| AppError::CaptureError(e.to_string()))?;

    // Encode to PNG -> Base64
    let base64 = encode_image_to_base64(&image)?;

    // Calculate logical dimensions - scale_factor() returns Result in xcap 0.8
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

fn encode_image_to_base64(image: &image::RgbaImage) -> Result<String, AppError> {
    let mut buffer = Cursor::new(Vec::new());

    // Use fast PNG compression
    let encoder = image::codecs::png::PngEncoder::new_with_quality(
        &mut buffer,
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

    let png_bytes = buffer.into_inner();
    Ok(base64::engine::general_purpose::STANDARD.encode(&png_bytes))
}
