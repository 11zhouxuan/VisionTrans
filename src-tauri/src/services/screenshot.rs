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
    // Convert RGBA to RGB for JPEG encoding (JPEG doesn't support alpha)
    let rgb_image: image::RgbImage = image::DynamicImage::ImageRgba8(image.clone()).to_rgb8();

    let mut buffer = Cursor::new(Vec::with_capacity(rgb_image.len() / 4));

    // Use JPEG encoding - much faster than PNG for screenshots
    // Quality 85 gives good visual quality with fast encoding
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, 85);

    encoder
        .write_image(
            rgb_image.as_raw(),
            rgb_image.width(),
            rgb_image.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| AppError::CaptureError(e.to_string()))?;

    let jpeg_bytes = buffer.into_inner();
    Ok(base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes))
}
