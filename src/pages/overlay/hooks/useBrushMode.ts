import { useRef, useCallback, type RefObject } from 'react';
import { BRUSH_COLOR, BRUSH_WIDTH } from '../../../lib/constants';

interface Point {
  x: number;
  y: number;
}

interface BrushModeHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  getPoints: () => Point[];
  isActive: () => boolean;
}

/**
 * Hook for brush (marker pen) drawing mode
 */
export function useBrushMode(canvasRef: RefObject<HTMLCanvasElement | null>): BrushModeHandlers {
  const isDrawing = useRef(false);
  const points = useRef<Point[]>([]);
  const rafId = useRef<number | null>(null);
  const pendingPoint = useRef<Point | null>(null);

  const drawPoint = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !pendingPoint.current) return;

    const point = pendingPoint.current;
    points.current.push(point);

    if (points.current.length < 2) return;

    // Draw semi-transparent highlight line (marker pen effect)
    ctx.beginPath();
    ctx.strokeStyle = BRUSH_COLOR;
    ctx.lineWidth = BRUSH_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const prev = points.current[points.current.length - 2];
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    pendingPoint.current = null;
    rafId.current = null;
  }, [canvasRef]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDrawing.current = true;
    points.current = [{ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }];
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing.current) return;

    pendingPoint.current = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };

    // Use requestAnimationFrame for throttled drawing
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(drawPoint);
    }
  }, [drawPoint]);

  const onMouseUp = useCallback(() => {
    isDrawing.current = false;
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  const getPoints = useCallback(() => points.current, []);
  const isActive = useCallback(() => isDrawing.current, []);

  return { onMouseDown, onMouseMove, onMouseUp, getPoints, isActive };
}
