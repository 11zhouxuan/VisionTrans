import { useCallback, type RefObject } from 'react';
import { MIN_CROP_SIZE, CROP_PADDING } from '../../../lib/constants';

interface Point {
  x: number;
  y: number;
}

/**
 * Hook for cropping canvas image based on drawn points
 */
export function useImageCrop(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const cropAndSend = useCallback((points: Point[]): string | null => {
    if (points.length < 2) return null;

    // Calculate minimum bounding rectangle
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.max(0, Math.min(...xs) - CROP_PADDING);
    const minY = Math.max(0, Math.min(...ys) - CROP_PADDING);
    const maxX = Math.min(window.innerWidth, Math.max(...xs) + CROP_PADDING);
    const maxY = Math.min(window.innerHeight, Math.max(...ys) + CROP_PADDING);

    const width = maxX - minX;
    const height = maxY - minY;

    // Filter out too-small regions
    if (width < MIN_CROP_SIZE || height < MIN_CROP_SIZE) return null;

    const canvas = canvasRef.current;
    if (!canvas) return null;

    // Crop specified area from Canvas
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.getImageData(
      minX * dpr, minY * dpr,
      width * dpr, height * dpr
    );

    // Create temporary Canvas to export as Base64
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width * dpr;
    tempCanvas.height = height * dpr;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    tempCtx.putImageData(imageData, 0, 0);

    // Return Base64 without data:image/png;base64, prefix
    return tempCanvas.toDataURL('image/png').split(',')[1];
  }, [canvasRef]);

  return { cropAndSend };
}
