import { useRef, useCallback, type RefObject } from 'react';
import { RECT_BORDER_COLOR, RECT_FILL_COLOR, RECT_BORDER_WIDTH } from '../../../lib/constants';

interface Point {
  x: number;
  y: number;
}

interface RectModeHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  getPoints: () => Point[];
  isActive: () => boolean;
}

/**
 * Hook for rectangle selection mode
 */
export function useRectMode(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  screenshotBase64: string | null
): RectModeHandlers {
  const isDrawing = useRef(false);
  const startPoint = useRef<Point>({ x: 0, y: 0 });
  const endPoint = useRef<Point>({ x: 0, y: 0 });
  const backgroundImage = useRef<HTMLImageElement | null>(null);

  // Load background image for redrawing
  const ensureBackgroundImage = useCallback(() => {
    if (!backgroundImage.current && screenshotBase64) {
      const img = new Image();
      img.src = `data:image/png;base64,${screenshotBase64}`;
      backgroundImage.current = img;
    }
  }, [screenshotBase64]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !backgroundImage.current) return;

    const dpr = window.devicePixelRatio || 1;

    // Clear and redraw background
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.drawImage(backgroundImage.current, 0, 0, canvas.width / dpr, canvas.height / dpr);

    // Draw rectangle selection
    const x = Math.min(startPoint.current.x, endPoint.current.x);
    const y = Math.min(startPoint.current.y, endPoint.current.y);
    const w = Math.abs(endPoint.current.x - startPoint.current.x);
    const h = Math.abs(endPoint.current.y - startPoint.current.y);

    if (w > 0 && h > 0) {
      ctx.fillStyle = RECT_FILL_COLOR;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = RECT_BORDER_COLOR;
      ctx.lineWidth = RECT_BORDER_WIDTH;
      ctx.strokeRect(x, y, w, h);
    }
  }, [canvasRef]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    ensureBackgroundImage();
    isDrawing.current = true;
    startPoint.current = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    endPoint.current = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
  }, [ensureBackgroundImage]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing.current) return;
    endPoint.current = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    requestAnimationFrame(redrawCanvas);
  }, [redrawCanvas]);

  const onMouseUp = useCallback(() => {
    isDrawing.current = false;
  }, []);

  const getPoints = useCallback((): Point[] => {
    const x1 = Math.min(startPoint.current.x, endPoint.current.x);
    const y1 = Math.min(startPoint.current.y, endPoint.current.y);
    const x2 = Math.max(startPoint.current.x, endPoint.current.x);
    const y2 = Math.max(startPoint.current.y, endPoint.current.y);
    return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  }, []);

  const isActive = useCallback(() => isDrawing.current, []);

  return { onMouseDown, onMouseMove, onMouseUp, getPoints, isActive };
}
