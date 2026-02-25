import { useRef, useState, useCallback, type RefObject } from 'react';

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move' | null;

interface UseSelectionReturn {
  selection: SelectionRect | null;
  isDrawing: boolean;
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  redraw: () => void;
  mousePos: { x: number; y: number };
  setInitialSelection: (rect: SelectionRect) => void;
  isOnResizeHandle: (x: number, y: number) => boolean;
}

const HANDLE_SIZE = 8;
const OVERLAY_ALPHA = 0.4;

export function useSelection(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  bgImage: HTMLImageElement | null,
  onAfterRedraw?: () => void
): UseSelectionReturn {
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const startPoint = useRef({ x: 0, y: 0 });
  const activeHandle = useRef<ResizeHandle>(null);
  const selRef = useRef<SelectionRect | null>(null);

  const EDGE_THRESHOLD = 6; // pixels from edge to trigger move

  // Detect which resize handle or edge is under the cursor
  const getHandleAt = useCallback((x: number, y: number, sel: SelectionRect): ResizeHandle => {
    const hs = HANDLE_SIZE;
    const { x: sx, y: sy, width: sw, height: sh } = sel;
    const mx = sx + sw / 2;
    const my = sy + sh / 2;

    // Check resize handles first (corners and midpoints)
    const handles: { handle: ResizeHandle; hx: number; hy: number }[] = [
      { handle: 'nw', hx: sx, hy: sy },
      { handle: 'n', hx: mx, hy: sy },
      { handle: 'ne', hx: sx + sw, hy: sy },
      { handle: 'e', hx: sx + sw, hy: my },
      { handle: 'se', hx: sx + sw, hy: sy + sh },
      { handle: 's', hx: mx, hy: sy + sh },
      { handle: 'sw', hx: sx, hy: sy + sh },
      { handle: 'w', hx: sx, hy: my },
    ];

    for (const { handle, hx, hy } of handles) {
      if (Math.abs(x - hx) <= hs && Math.abs(y - hy) <= hs) {
        return handle;
      }
    }

    // Check if on the edge of the selection (for move)
    const et = EDGE_THRESHOLD;
    const onLeft = Math.abs(x - sx) <= et && y >= sy - et && y <= sy + sh + et;
    const onRight = Math.abs(x - (sx + sw)) <= et && y >= sy - et && y <= sy + sh + et;
    const onTop = Math.abs(y - sy) <= et && x >= sx - et && x <= sx + sw + et;
    const onBottom = Math.abs(y - (sy + sh)) <= et && x >= sx - et && x <= sx + sw + et;

    if (onLeft || onRight || onTop || onBottom) {
      return 'move';
    }

    return null;
  }, []);

  // Draw everything on canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !bgImage) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // Clear
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Draw background image
    ctx.drawImage(bgImage, 0, 0, w, h);

    const sel = selRef.current;

    // Draw dark overlay (with selection cutout)
    ctx.fillStyle = `rgba(0, 0, 0, ${OVERLAY_ALPHA})`;
    if (sel && sel.width > 0 && sel.height > 0) {
      // Top
      ctx.fillRect(0, 0, w, sel.y);
      // Bottom
      ctx.fillRect(0, sel.y + sel.height, w, h - sel.y - sel.height);
      // Left
      ctx.fillRect(0, sel.y, sel.x, sel.height);
      // Right
      ctx.fillRect(sel.x + sel.width, sel.y, w - sel.x - sel.width, sel.height);

      // Selection border
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(sel.x, sel.y, sel.width, sel.height);
      ctx.setLineDash([]);

      // Selection dimensions text - positioned at top-left of selection
      ctx.font = '11px -apple-system, sans-serif';
      const dimText = `${Math.round(sel.width * dpr)} × ${Math.round(sel.height * dpr)}`;
      const textWidth = ctx.measureText(dimText).width;
      const textX = sel.x + 4;
      const textY = sel.y - 6;
      // If selection is near top, show inside
      const actualTextY = textY < 14 ? sel.y + 14 : textY;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(textX - 2, actualTextY - 11, textWidth + 4, 15);
      ctx.fillStyle = '#fff';
      ctx.fillText(dimText, textX, actualTextY);

      // Draw 8 resize handles (only when not actively drawing)
      if (!isDrawing) {
        const hs = HANDLE_SIZE;
        const handles = [
          { x: sel.x, y: sel.y },
          { x: sel.x + sel.width / 2, y: sel.y },
          { x: sel.x + sel.width, y: sel.y },
          { x: sel.x + sel.width, y: sel.y + sel.height / 2 },
          { x: sel.x + sel.width, y: sel.y + sel.height },
          { x: sel.x + sel.width / 2, y: sel.y + sel.height },
          { x: sel.x, y: sel.y + sel.height },
          { x: sel.x, y: sel.y + sel.height / 2 },
        ];
        for (const hp of handles) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1.5;
          ctx.fillRect(hp.x - hs / 2, hp.y - hs / 2, hs, hs);
          ctx.strokeRect(hp.x - hs / 2, hp.y - hs / 2, hs, hs);
        }
      }
    } else {
      // No selection - full dark overlay
      ctx.fillRect(0, 0, w, h);
    }

    // Call after-redraw callback (e.g., to overlay marks)
    if (onAfterRedraw) onAfterRedraw();
  }, [canvasRef, bgImage, isDrawing, onAfterRedraw]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;

    // Check if clicking on a resize handle
    if (selRef.current && !isDrawing) {
      const handle = getHandleAt(x, y, selRef.current);
      if (handle) {
        activeHandle.current = handle;
        startPoint.current = { x, y };
        setIsResizing(true);
        return;
      }
    }

    // Start new selection
    startPoint.current = { x, y };
    selRef.current = { x, y, width: 0, height: 0 };
    setSelection(selRef.current);
    setIsDrawing(true);
    activeHandle.current = null;
  }, [isDrawing, getHandleAt]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    setMousePos({ x, y });

    if (isDrawing) {
      // Drawing new selection
      const sx = Math.min(startPoint.current.x, x);
      const sy = Math.min(startPoint.current.y, y);
      const sw = Math.abs(x - startPoint.current.x);
      const sh = Math.abs(y - startPoint.current.y);
      selRef.current = { x: sx, y: sy, width: sw, height: sh };
      setSelection({ ...selRef.current });
      redraw();
    } else if (isResizing && selRef.current && activeHandle.current) {
      // Resizing or moving existing selection
      const dx = x - startPoint.current.x;
      const dy = y - startPoint.current.y;
      const sel = { ...selRef.current };
      const handle = activeHandle.current;

      if (handle === 'move') {
        // Move the entire selection
        sel.x += dx;
        sel.y += dy;
      } else {
        if (handle.includes('w')) {
          sel.x += dx;
          sel.width -= dx;
        }
        if (handle.includes('e')) {
          sel.width += dx;
        }
        if (handle.includes('n')) {
          sel.y += dy;
          sel.height -= dy;
        }
        if (handle.includes('s')) {
          sel.height += dy;
        }
      }

      // Ensure positive dimensions
      if (sel.width < 10) sel.width = 10;
      if (sel.height < 10) sel.height = 10;

      selRef.current = sel;
      setSelection({ ...sel });
      startPoint.current = { x, y };
      redraw();
    } else {
      // Just moving mouse - only update cursor, don't redraw (preserves marks)
    }

    // Update cursor based on handle hover
    if (!isDrawing && !isResizing && selRef.current) {
      const handle = getHandleAt(x, y, selRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        if (handle === 'nw' || handle === 'se') canvas.style.cursor = 'nwse-resize';
        else if (handle === 'ne' || handle === 'sw') canvas.style.cursor = 'nesw-resize';
        else if (handle === 'n' || handle === 's') canvas.style.cursor = 'ns-resize';
        else if (handle === 'e' || handle === 'w') canvas.style.cursor = 'ew-resize';
        else if (handle === 'move') canvas.style.cursor = 'move';
        else canvas.style.cursor = 'crosshair';
      }
    }
  }, [isDrawing, isResizing, redraw, getHandleAt, canvasRef]);

  const onMouseUp = useCallback(() => {
    setIsDrawing(false);
    setIsResizing(false);
    activeHandle.current = null;
    redraw();
  }, [redraw]);

  const setInitialSelection = useCallback((rect: SelectionRect) => {
    selRef.current = rect;
    setSelection(rect);
  }, []);

  const isOnResizeHandle = useCallback((x: number, y: number): boolean => {
    if (!selRef.current) return false;
    return getHandleAt(x, y, selRef.current) !== null;
  }, [getHandleAt]);

  return { selection, isDrawing, isResizing, onMouseDown, onMouseMove, onMouseUp, redraw, mousePos, setInitialSelection, isOnResizeHandle };
}
