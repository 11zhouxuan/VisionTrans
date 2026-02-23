import { useEffect, type RefObject } from 'react';

/**
 * Hook to initialize Canvas with screenshot as background
 */
export function useCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  screenshotBase64: string | null
) {
  useEffect(() => {
    if (!canvasRef.current || !screenshotBase64) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set Canvas physical size = window size × devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr);

    // Draw screenshot as background
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, window.innerWidth, window.innerHeight);
    };
    img.src = `data:image/png;base64,${screenshotBase64}`;
  }, [canvasRef, screenshotBase64]);
}
