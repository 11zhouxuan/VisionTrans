#!/usr/bin/env python3
"""Generate VisionTrans app icons.

Design: A modern rounded-square icon with a gradient background (indigo to violet),
featuring a stylized eye/lens symbol combined with translation arrows,
representing "visual translation".
"""

from PIL import Image, ImageDraw, ImageFont
import math
import os

ICON_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src-tauri", "icons")


def create_gradient(size, color1, color2, direction="diagonal"):
    """Create a gradient image."""
    img = Image.new("RGBA", (size, size))
    pixels = img.load()
    for y in range(size):
        for x in range(size):
            if direction == "diagonal":
                t = (x + y) / (2 * size)
            else:
                t = y / size
            r = int(color1[0] + (color2[0] - color1[0]) * t)
            g = int(color1[1] + (color2[1] - color1[1]) * t)
            b = int(color1[2] + (color2[2] - color1[2]) * t)
            a = int(color1[3] + (color2[3] - color1[3]) * t) if len(color1) > 3 else 255
            pixels[x, y] = (r, g, b, a)
    return img


def draw_rounded_rect(draw, bbox, radius, fill):
    """Draw a rounded rectangle."""
    x1, y1, x2, y2 = bbox
    draw.rectangle([x1 + radius, y1, x2 - radius, y2], fill=fill)
    draw.rectangle([x1, y1 + radius, x2, y2 - radius], fill=fill)
    draw.pieslice([x1, y1, x1 + 2 * radius, y1 + 2 * radius], 180, 270, fill=fill)
    draw.pieslice([x2 - 2 * radius, y1, x2, y1 + 2 * radius], 270, 360, fill=fill)
    draw.pieslice([x1, y2 - 2 * radius, x1 + 2 * radius, y2], 90, 180, fill=fill)
    draw.pieslice([x2 - 2 * radius, y2 - 2 * radius, x2, y2], 0, 90, fill=fill)


def generate_icon(size):
    """Generate the main app icon at the given size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background: rounded rectangle with gradient
    margin = int(size * 0.04)
    radius = int(size * 0.22)

    # Create gradient background
    grad = create_gradient(size, (79, 70, 229, 255), (139, 92, 246, 255), "diagonal")  # indigo-600 to violet-500

    # Create mask for rounded rectangle
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    draw_rounded_rect(mask_draw, [margin, margin, size - margin, size - margin], radius, 255)

    # Apply gradient with rounded rect mask
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg.paste(grad, mask=mask)
    img = Image.alpha_composite(img, bg)
    draw = ImageDraw.Draw(img)

    # Add subtle inner shadow/glow
    inner_margin = margin + int(size * 0.02)
    inner_radius = radius - int(size * 0.01)

    # --- Draw the icon symbol ---
    cx, cy = size // 2, size // 2

    # Eye shape (lens/vision symbol)
    eye_w = int(size * 0.52)
    eye_h = int(size * 0.28)
    eye_top = cy - eye_h // 2
    eye_left = cx - eye_w // 2

    # Draw eye outline (white, thick)
    white = (255, 255, 255, 240)
    white_soft = (255, 255, 255, 180)
    line_w = max(int(size * 0.035), 2)

    # Upper arc of eye
    draw.arc(
        [eye_left, eye_top - int(eye_h * 0.3), eye_left + eye_w, eye_top + int(eye_h * 1.3)],
        200, 340, fill=white, width=line_w
    )
    # Lower arc of eye
    draw.arc(
        [eye_left, eye_top - int(eye_h * 0.3), eye_left + eye_w, eye_top + int(eye_h * 1.3)],
        20, 160, fill=white, width=line_w
    )

    # Pupil (filled circle in center)
    pupil_r = int(size * 0.09)
    draw.ellipse(
        [cx - pupil_r, cy - pupil_r, cx + pupil_r, cy + pupil_r],
        fill=white
    )

    # Inner pupil highlight
    highlight_r = int(size * 0.035)
    highlight_offset = int(size * 0.025)
    draw.ellipse(
        [cx - highlight_r - highlight_offset, cy - highlight_r - highlight_offset,
         cx + highlight_r - highlight_offset, cy + highlight_r - highlight_offset],
        fill=(79, 70, 229, 200)  # indigo dot
    )

    # Translation arrows (two small arrows below the eye)
    arrow_y = cy + int(size * 0.2)
    arrow_len = int(size * 0.12)
    arrow_head = int(size * 0.04)
    arrow_w = max(int(size * 0.025), 2)

    # Right arrow →
    ax1 = cx - int(size * 0.02)
    ax2 = ax1 + arrow_len
    draw.line([(ax1, arrow_y), (ax2, arrow_y)], fill=white_soft, width=arrow_w)
    draw.polygon([
        (ax2, arrow_y - arrow_head),
        (ax2 + arrow_head, arrow_y),
        (ax2, arrow_y + arrow_head)
    ], fill=white_soft)

    # Left arrow ← (slightly above)
    arrow_y2 = arrow_y - int(size * 0.06)
    bx2 = cx + int(size * 0.02)
    bx1 = bx2 - arrow_len
    draw.line([(bx2, arrow_y2), (bx1, arrow_y2)], fill=white_soft, width=arrow_w)
    draw.polygon([
        (bx1, arrow_y2 - arrow_head),
        (bx1 - arrow_head, arrow_y2),
        (bx1, arrow_y2 + arrow_head)
    ], fill=white_soft)

    # "V" letter at top-left corner (subtle branding)
    v_size = int(size * 0.1)
    v_x = margin + int(size * 0.1)
    v_y = margin + int(size * 0.08)
    v_w = max(int(size * 0.025), 2)
    draw.line([(v_x, v_y), (v_x + v_size // 2, v_y + v_size)], fill=white_soft, width=v_w)
    draw.line([(v_x + v_size // 2, v_y + v_size), (v_x + v_size, v_y)], fill=white_soft, width=v_w)

    return img


def generate_tray_icon(size):
    """Generate a simpler tray icon (monochrome-friendly)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = size // 2, size // 2
    color = (50, 50, 50, 230)  # Dark gray for tray
    line_w = max(int(size * 0.06), 1)

    # Simple eye shape
    eye_w = int(size * 0.7)
    eye_h = int(size * 0.35)
    eye_left = cx - eye_w // 2
    eye_top = cy - eye_h // 2

    draw.arc(
        [eye_left, eye_top - int(eye_h * 0.3), eye_left + eye_w, eye_top + int(eye_h * 1.3)],
        200, 340, fill=color, width=line_w
    )
    draw.arc(
        [eye_left, eye_top - int(eye_h * 0.3), eye_left + eye_w, eye_top + int(eye_h * 1.3)],
        20, 160, fill=color, width=line_w
    )

    # Pupil
    pupil_r = int(size * 0.12)
    draw.ellipse(
        [cx - pupil_r, cy - pupil_r, cx + pupil_r, cy + pupil_r],
        fill=color
    )

    return img


def main():
    os.makedirs(ICON_DIR, exist_ok=True)

    print("Generating VisionTrans icons...")

    # Main icon at high resolution, then resize
    icon_1024 = generate_icon(1024)

    # Save main icon
    icon_1024.save(os.path.join(ICON_DIR, "icon.png"))
    print("  ✓ icon.png (1024x1024)")

    # 128x128@2x (256x256)
    icon_256 = icon_1024.resize((256, 256), Image.LANCZOS)
    icon_256.save(os.path.join(ICON_DIR, "128x128@2x.png"))
    print("  ✓ 128x128@2x.png (256x256)")

    # 128x128
    icon_128 = icon_1024.resize((128, 128), Image.LANCZOS)
    icon_128.save(os.path.join(ICON_DIR, "128x128.png"))
    print("  ✓ 128x128.png")

    # 32x32
    icon_32 = icon_1024.resize((32, 32), Image.LANCZOS)
    icon_32.save(os.path.join(ICON_DIR, "32x32.png"))
    print("  ✓ 32x32.png")

    # Windows .ico (multi-size)
    icon_48 = icon_1024.resize((48, 48), Image.LANCZOS)
    icon_16 = icon_1024.resize((16, 16), Image.LANCZOS)
    icon_1024.save(
        os.path.join(ICON_DIR, "icon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (256, 256)]
    )
    print("  ✓ icon.ico (16/32/48/256)")

    # Tray icons
    tray_22 = generate_tray_icon(22)
    tray_22.save(os.path.join(ICON_DIR, "tray-icon.png"))
    print("  ✓ tray-icon.png (22x22)")

    tray_44 = generate_tray_icon(44)
    tray_44.save(os.path.join(ICON_DIR, "tray-icon@2x.png"))
    print("  ✓ tray-icon@2x.png (44x44)")

    print("\nAll icons generated successfully!")


if __name__ == "__main__":
    main()