import { useEffect, useRef } from 'react';

interface MagnifierProps {
  mouseX: number;
  mouseY: number;
  bgImage: HTMLImageElement | null;
  visible: boolean;
}

const MAG_SIZE = 120;
const MAG_ZOOM = 4;
const MAG_OFFSET = 20;

export default function Magnifier({ mouseX, mouseY, bgImage, visible }: MagnifierProps) {
  const magCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible || !bgImage || !magCanvasRef.current) return;

    const canvas = magCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const sourceSize = MAG_SIZE / MAG_ZOOM;

    // Source coordinates in the original image (accounting for DPR)
    const sx = mouseX * dpr - (sourceSize * dpr) / 2;
    const sy = mouseY * dpr - (sourceSize * dpr) / 2;
    const sw = sourceSize * dpr;
    const sh = sourceSize * dpr;

    // Clear and draw magnified region
    ctx.clearRect(0, 0, MAG_SIZE * 2, MAG_SIZE * 2);

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(MAG_SIZE, MAG_SIZE, MAG_SIZE, 0, Math.PI * 2);
    ctx.clip();

    // Draw magnified image
    ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, MAG_SIZE * 2, MAG_SIZE * 2);

    // Draw crosshair in center
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MAG_SIZE, MAG_SIZE - 10);
    ctx.lineTo(MAG_SIZE, MAG_SIZE + 10);
    ctx.moveTo(MAG_SIZE - 10, MAG_SIZE);
    ctx.lineTo(MAG_SIZE + 10, MAG_SIZE);
    ctx.stroke();

    ctx.restore();

    // Draw circle border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(MAG_SIZE, MAG_SIZE, MAG_SIZE - 1, 0, Math.PI * 2);
    ctx.stroke();
  }, [mouseX, mouseY, bgImage, visible]);

  if (!visible) return null;

  // Position magnifier near cursor but avoid screen edges
  let left = mouseX + MAG_OFFSET;
  let top = mouseY + MAG_OFFSET;

  if (left + MAG_SIZE * 2 > window.innerWidth) {
    left = mouseX - MAG_SIZE * 2 - MAG_OFFSET;
  }
  if (top + MAG_SIZE * 2 + 30 > window.innerHeight) {
    top = mouseY - MAG_SIZE * 2 - MAG_OFFSET - 30;
  }

  const dpr = window.devicePixelRatio || 1;

  return (
    <div
      className="fixed pointer-events-none z-50"
      style={{ left, top }}
    >
      <canvas
        ref={magCanvasRef}
        width={MAG_SIZE * 2}
        height={MAG_SIZE * 2}
        style={{ width: MAG_SIZE * 2, height: MAG_SIZE * 2 }}
      />
      {/* Coordinate display */}
      <div className="mt-1 text-center">
        <span className="bg-black/70 text-white text-xs px-2 py-0.5 rounded font-mono">
          {Math.round(mouseX * dpr)}, {Math.round(mouseY * dpr)}
        </span>
      </div>
    </div>
  );
}
