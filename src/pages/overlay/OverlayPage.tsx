import { useRef, useEffect, useCallback, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useSelection } from './hooks/useSelection';
import SelectionToolbar from './components/SelectionToolbar';
import type { ScreenshotData } from '../../types/translate';
import { MIN_CROP_SIZE } from '../../lib/constants';

type MarkTool = 'none' | 'brush' | 'rect' | 'arrow';

// ==================== Annotation Types ====================

interface RectAnnotation {
  type: 'rect';
  x: number; y: number; width: number; height: number;
  color: string; lineWidth: number;
}

interface ArrowAnnotation {
  type: 'arrow';
  x1: number; y1: number; x2: number; y2: number;
  color: string; lineWidth: number;
}

interface BrushAnnotation {
  type: 'brush';
  points: { x: number; y: number }[];
  color: string; lineWidth: number;
}

type Annotation = RectAnnotation | ArrowAnnotation | BrushAnnotation;

type AnnotationHandle =
  | { annIdx: number; handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move' }  // rect
  | { annIdx: number; handle: 'start' | 'end' | 'move' }  // arrow
  | { annIdx: number; handle: 'move' };  // brush

const ANN_HANDLE_THRESHOLD = 8;

// ==================== Hit Testing ====================

function hitTestAnnotations(x: number, y: number, annotations: Annotation[]): AnnotationHandle | null {
  // Test in reverse order (top-most first)
  for (let i = annotations.length - 1; i >= 0; i--) {
    const ann = annotations[i];
    const hit = hitTestAnnotation(x, y, ann, i);
    if (hit) return hit;
  }
  return null;
}

function hitTestAnnotation(x: number, y: number, ann: Annotation, idx: number): AnnotationHandle | null {
  const t = ANN_HANDLE_THRESHOLD;

  if (ann.type === 'rect') {
    const { x: rx, y: ry, width: rw, height: rh } = ann;
    const mx = rx + rw / 2;
    const my = ry + rh / 2;

    // Corner handles
    if (Math.abs(x - rx) <= t && Math.abs(y - ry) <= t) return { annIdx: idx, handle: 'nw' };
    if (Math.abs(x - (rx + rw)) <= t && Math.abs(y - ry) <= t) return { annIdx: idx, handle: 'ne' };
    if (Math.abs(x - (rx + rw)) <= t && Math.abs(y - (ry + rh)) <= t) return { annIdx: idx, handle: 'se' };
    if (Math.abs(x - rx) <= t && Math.abs(y - (ry + rh)) <= t) return { annIdx: idx, handle: 'sw' };

    // Edge midpoint handles
    if (Math.abs(x - mx) <= t && Math.abs(y - ry) <= t) return { annIdx: idx, handle: 'n' };
    if (Math.abs(x - (rx + rw)) <= t && Math.abs(y - my) <= t) return { annIdx: idx, handle: 'e' };
    if (Math.abs(x - mx) <= t && Math.abs(y - (ry + rh)) <= t) return { annIdx: idx, handle: 's' };
    if (Math.abs(x - rx) <= t && Math.abs(y - my) <= t) return { annIdx: idx, handle: 'w' };

    // Edge proximity (for move)
    const onEdge =
      (Math.abs(x - rx) <= t && y >= ry - t && y <= ry + rh + t) ||
      (Math.abs(x - (rx + rw)) <= t && y >= ry - t && y <= ry + rh + t) ||
      (Math.abs(y - ry) <= t && x >= rx - t && x <= rx + rw + t) ||
      (Math.abs(y - (ry + rh)) <= t && x >= rx - t && x <= rx + rw + t);
    if (onEdge) return { annIdx: idx, handle: 'move' };
  }

  if (ann.type === 'arrow') {
    // Check endpoints
    if (Math.abs(x - ann.x1) <= t && Math.abs(y - ann.y1) <= t) return { annIdx: idx, handle: 'start' };
    if (Math.abs(x - ann.x2) <= t && Math.abs(y - ann.y2) <= t) return { annIdx: idx, handle: 'end' };

    // Check proximity to the line
    const dist = pointToLineDistance(x, y, ann.x1, ann.y1, ann.x2, ann.y2);
    if (dist <= t + 2) return { annIdx: idx, handle: 'move' };
  }

  if (ann.type === 'brush') {
    // Check proximity to any point in the stroke
    for (const pt of ann.points) {
      if (Math.abs(x - pt.x) <= t && Math.abs(y - pt.y) <= t) {
        return { annIdx: idx, handle: 'move' };
      }
    }
  }

  return null;
}

function pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

// ==================== Drawing Helpers ====================

function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation) {
  if (ann.type === 'rect') {
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = ann.lineWidth;
    ctx.setLineDash([]);
    ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
  } else if (ann.type === 'arrow') {
    drawArrow(ctx, ann.x1, ann.y1, ann.x2, ann.y2, ann.color);
  } else if (ann.type === 'brush') {
    if (ann.points.length < 2) return;
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = ann.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(ann.points[0].x, ann.points[0].y);
    for (let i = 1; i < ann.points.length; i++) {
      ctx.lineTo(ann.points[i].x, ann.points[i].y);
    }
    ctx.stroke();
  }
}

function drawAnnotationHandles(ctx: CanvasRenderingContext2D, ann: Annotation) {
  const hs = 6;
  const drawHandle = (hx: number, hy: number) => {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
  };

  if (ann.type === 'rect') {
    const { x, y, width: w, height: h } = ann;
    drawHandle(x, y);
    drawHandle(x + w / 2, y);
    drawHandle(x + w, y);
    drawHandle(x + w, y + h / 2);
    drawHandle(x + w, y + h);
    drawHandle(x + w / 2, y + h);
    drawHandle(x, y + h);
    drawHandle(x, y + h / 2);
  } else if (ann.type === 'arrow') {
    drawHandle(ann.x1, ann.y1);
    drawHandle(ann.x2, ann.y2);
  }
  // Brush: no handles, just move
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 5) return;

  const angle = Math.atan2(dy, dx);
  const headLen = Math.min(len * 0.35, 28);
  const headWidth = headLen * 0.7;
  const tailWidth = 3;

  const headBaseX = x2 - headLen * Math.cos(angle);
  const headBaseY = y2 - headLen * Math.sin(angle);
  const perpX = -Math.sin(angle);
  const perpY = Math.cos(angle);

  ctx.fillStyle = color;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1 + perpX * tailWidth, y1 + perpY * tailWidth);
  ctx.lineTo(x1 - perpX * tailWidth, y1 - perpY * tailWidth);
  ctx.lineTo(headBaseX - perpX * tailWidth, headBaseY - perpY * tailWidth);
  ctx.lineTo(headBaseX - perpX * headWidth, headBaseY - perpY * headWidth);
  ctx.lineTo(x2, y2);
  ctx.lineTo(headBaseX + perpX * headWidth, headBaseY + perpY * headWidth);
  ctx.lineTo(headBaseX + perpX * tailWidth, headBaseY + perpY * tailWidth);
  ctx.closePath();
  ctx.fill();
}

function getCursorForHandle(handle: AnnotationHandle | null): string | null {
  if (!handle) return null;
  const h = handle.handle;
  if (h === 'nw' || h === 'se') return 'nwse-resize';
  if (h === 'ne' || h === 'sw') return 'nesw-resize';
  if (h === 'n' || h === 's') return 'ns-resize';
  if (h === 'e' || h === 'w') return 'ew-resize';
  if (h === 'move') return 'move';
  if (h === 'start' || h === 'end') return 'crosshair';
  return null;
}

// ==================== Main Component ====================

export default function OverlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [markTool, setMarkTool] = useState<MarkTool>('rect');
  const [brushSize, setBrushSize] = useState(4);
  const [brushColor, setBrushColor] = useState('rgba(255, 50, 50, 0.8)');

  // Object-based annotations
  const annotationsRef = useRef<Annotation[]>([]);
  const [annotationVersion, setAnnotationVersion] = useState(0); // trigger re-renders
  const isMarking = useRef(false);
  const markStart = useRef({ x: 0, y: 0 });
  const currentBrushPoints = useRef<{ x: number; y: number }[]>([]);

  // Annotation editing state
  const editingHandle = useRef<AnnotationHandle | null>(null);
  const editStartPos = useRef({ x: 0, y: 0 });
  const isEditingAnnotation = useRef(false);
  const hoveredHandleRef = useRef<AnnotationHandle | null>(null);

  // Undo/Redo history (snapshots of annotations array)
  const undoStack = useRef<Annotation[][]>([]);
  const redoStack = useRef<Annotation[][]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const saveSnapshot = useCallback(() => {
    undoStack.current.push(JSON.parse(JSON.stringify(annotationsRef.current)));
    redoStack.current = [];
    setUndoCount(undoStack.current.length);
    setRedoCount(0);
  }, []);

  // Fetch screenshot data
  useEffect(() => {
    const fetchScreenshot = async () => {
      try {
        const data = await invoke<ScreenshotData>('get_screenshot');
        setScreenshotBase64(data.base64);
      } catch (err) {
        console.error('Failed to get screenshot:', err);
      }
    };
    fetchScreenshot();
  }, []);

  // Load background image and initialize canvases
  useEffect(() => {
    if (!canvasRef.current || !screenshotBase64) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);

    const img = new Image();
    img.onload = () => setBgImage(img);
    img.src = `data:image/png;base64,${screenshotBase64}`;
  }, [screenshotBase64]);

  // Render all annotations on the canvas (called after selection redraw)
  // NOTE: This callback must have stable identity to prevent the useEffect
  // that sets initial selection from re-firing when annotations change.
  const overlayMarks = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    // Draw all committed annotations
    for (const ann of annotationsRef.current) {
      drawAnnotation(ctx, ann);
    }

    // Draw handles for hovered annotation (when not actively marking)
    const hovered = hoveredHandleRef.current;
    if (hovered && !isMarking.current && !isEditingAnnotation.current) {
      const ann = annotationsRef.current[hovered.annIdx];
      if (ann) drawAnnotationHandles(ctx, ann);
    }

    // Draw handles for annotation being edited
    if (isEditingAnnotation.current && editingHandle.current) {
      const ann = annotationsRef.current[editingHandle.current.annIdx];
      if (ann) drawAnnotationHandles(ctx, ann);
    }
  }, []); // stable - reads from refs only

  const {
    selection, isDrawing, isResizing,
    onMouseDown, onMouseMove, onMouseUp,
    redraw, setInitialSelection, isOnResizeHandle,
  } = useSelection(canvasRef, bgImage, overlayMarks);

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const current = JSON.parse(JSON.stringify(annotationsRef.current));
    redoStack.current.push(current);
    annotationsRef.current = undoStack.current.pop()!;
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    setAnnotationVersion(v => v + 1);
    redraw();
  }, [redraw]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const current = JSON.parse(JSON.stringify(annotationsRef.current));
    undoStack.current.push(current);
    annotationsRef.current = redoStack.current.pop()!;
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    setAnnotationVersion(v => v + 1);
    redraw();
  }, [redraw]);

  useEffect(() => {
    if (bgImage) {
      const padding = 0.1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      setInitialSelection({
        x: Math.round(w * padding), y: Math.round(h * padding),
        width: Math.round(w * (1 - 2 * padding)), height: Math.round(h * (1 - 2 * padding)),
      });
      redraw();
    }
  }, [bgImage, setInitialSelection, redraw]);

  const showToolbar = selection && selection.width > MIN_CROP_SIZE && selection.height > MIN_CROP_SIZE && !isDrawing && !isResizing;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;

    // Always prioritize selection resize handles
    if (isOnResizeHandle(x, y)) {
      onMouseDown(e);
      return;
    }

    // Check if clicking on an annotation handle (for editing)
    if (markTool !== 'none') {
      const hit = hitTestAnnotations(x, y, annotationsRef.current);
      if (hit) {
        saveSnapshot();
        isEditingAnnotation.current = true;
        editingHandle.current = hit;
        editStartPos.current = { x, y };
        return;
      }
    }

    // Start new annotation inside selection
    if (markTool !== 'none' && selection) {
      if (x >= selection.x && x <= selection.x + selection.width &&
          y >= selection.y && y <= selection.y + selection.height) {
        saveSnapshot();
        isMarking.current = true;
        markStart.current = { x, y };
        if (markTool === 'brush') {
          currentBrushPoints.current = [{ x, y }];
        }
        return;
      }
    }

    onMouseDown(e);
  }, [markTool, selection, onMouseDown, saveSnapshot, isOnResizeHandle]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;

    // Editing an existing annotation
    if (isEditingAnnotation.current && editingHandle.current) {
      const dx = x - editStartPos.current.x;
      const dy = y - editStartPos.current.y;
      const idx = editingHandle.current.annIdx;
      const ann = annotationsRef.current[idx];
      const h = editingHandle.current.handle;

      if (ann.type === 'rect') {
        if (h === 'move') {
          ann.x += dx; ann.y += dy;
        } else if (h === 'nw') {
          ann.x += dx; ann.y += dy; ann.width -= dx; ann.height -= dy;
        } else if (h === 'n') {
          ann.y += dy; ann.height -= dy;
        } else if (h === 'ne') {
          ann.width += dx; ann.y += dy; ann.height -= dy;
        } else if (h === 'e') {
          ann.width += dx;
        } else if (h === 'se') {
          ann.width += dx; ann.height += dy;
        } else if (h === 's') {
          ann.height += dy;
        } else if (h === 'sw') {
          ann.x += dx; ann.width -= dx; ann.height += dy;
        } else if (h === 'w') {
          ann.x += dx; ann.width -= dx;
        }
        // Ensure minimum size
        if (ann.width < 5) ann.width = 5;
        if (ann.height < 5) ann.height = 5;
      } else if (ann.type === 'arrow') {
        if (h === 'start') {
          ann.x1 += dx; ann.y1 += dy;
        } else if (h === 'end') {
          ann.x2 += dx; ann.y2 += dy;
        } else if (h === 'move') {
          ann.x1 += dx; ann.y1 += dy; ann.x2 += dx; ann.y2 += dy;
        }
      } else if (ann.type === 'brush' && h === 'move') {
        for (const pt of ann.points) {
          pt.x += dx; pt.y += dy;
        }
      }

      editStartPos.current = { x, y };
      redraw();
      return;
    }

    // Drawing new annotation
    if (isMarking.current && markTool !== 'none') {
      if (markTool === 'brush') {
        currentBrushPoints.current.push({ x, y });
        // Live preview: temporarily add brush annotation
        const tempAnn: BrushAnnotation = {
          type: 'brush', points: [...currentBrushPoints.current],
          color: brushColor, lineWidth: brushSize,
        };
        // Draw preview
        redraw();
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) drawAnnotation(ctx, tempAnn);
      } else if (markTool === 'rect') {
        redraw();
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          const rx = Math.min(markStart.current.x, x);
          const ry = Math.min(markStart.current.y, y);
          const rw = Math.abs(x - markStart.current.x);
          const rh = Math.abs(y - markStart.current.y);
          ctx.strokeStyle = brushColor;
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.strokeRect(rx, ry, rw, rh);
        }
      } else if (markTool === 'arrow') {
        redraw();
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          drawArrow(ctx, markStart.current.x, markStart.current.y, x, y, brushColor);
        }
      }
      return;
    }

    // Hover detection for annotation handles
    if (!isMarking.current && !isEditingAnnotation.current && markTool !== 'none') {
      const hit = hitTestAnnotations(x, y, annotationsRef.current);
      const prev = hoveredHandleRef.current;
      const changed = (hit === null) !== (prev === null) ||
        (hit && prev && (hit.annIdx !== prev.annIdx || hit.handle !== prev.handle));
      if (changed) {
        hoveredHandleRef.current = hit;
        redraw(); // redraw to show/hide handles
      }
    }

    onMouseMove(e);
  }, [markTool, brushColor, brushSize, onMouseMove, redraw]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Finish editing annotation
    if (isEditingAnnotation.current) {
      isEditingAnnotation.current = false;
      editingHandle.current = null;
      setAnnotationVersion(v => v + 1);
      redraw();
      return;
    }

    // Finish drawing new annotation
    if (isMarking.current && markTool !== 'none') {
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;

      if (markTool === 'rect') {
        const rx = Math.min(markStart.current.x, x);
        const ry = Math.min(markStart.current.y, y);
        const rw = Math.abs(x - markStart.current.x);
        const rh = Math.abs(y - markStart.current.y);
        if (rw > 3 && rh > 3) {
          annotationsRef.current.push({
            type: 'rect', x: rx, y: ry, width: rw, height: rh,
            color: brushColor, lineWidth: 2,
          });
        }
      } else if (markTool === 'arrow') {
        const len = Math.sqrt((x - markStart.current.x) ** 2 + (y - markStart.current.y) ** 2);
        if (len > 5) {
          annotationsRef.current.push({
            type: 'arrow',
            x1: markStart.current.x, y1: markStart.current.y, x2: x, y2: y,
            color: brushColor, lineWidth: 2,
          });
        }
      } else if (markTool === 'brush') {
        if (currentBrushPoints.current.length > 1) {
          annotationsRef.current.push({
            type: 'brush', points: [...currentBrushPoints.current],
            color: brushColor, lineWidth: brushSize,
          });
        }
        currentBrushPoints.current = [];
      }

      isMarking.current = false;
      setAnnotationVersion(v => v + 1);
      redraw();
      return;
    }

    onMouseUp();
  }, [markTool, brushColor, brushSize, onMouseUp, redraw]);

  const cropSelection = useCallback((): string | null => {
    if (!selection || !bgImage) return null;
    const dpr = window.devicePixelRatio || 1;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = selection.width * dpr;
    tempCanvas.height = selection.height * dpr;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    // Draw background
    tempCtx.drawImage(bgImage,
      selection.x * dpr, selection.y * dpr, selection.width * dpr, selection.height * dpr,
      0, 0, selection.width * dpr, selection.height * dpr);

    // Draw annotations (scaled)
    tempCtx.scale(dpr, dpr);
    tempCtx.translate(-selection.x, -selection.y);
    for (const ann of annotationsRef.current) {
      drawAnnotation(tempCtx, ann);
    }

    return tempCanvas.toDataURL('image/png').split(',')[1];
  }, [selection, bgImage]);

  const handleTranslate = useCallback(async () => {
    const croppedBase64 = cropSelection();
    if (!croppedBase64 || !selection) return;
    try {
      const pos = { x: 80, y: 64 };
      await invoke('start_translation', { imageBase64: croppedBase64, position: pos });
    } catch (err) { console.error('Failed:', err); }
    try { await getCurrentWindow().close(); } catch {}
  }, [cropSelection, selection]);

  const handleCancel = useCallback(async () => {
    try { await invoke('close_overlay'); } catch { await getCurrentWindow().close(); }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
      else if (e.key === 'Enter' && showToolbar) handleTranslate();
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel, handleTranslate, showToolbar, handleUndo, handleRedo]);

  const getCursor = () => {
    // Show annotation handle cursor when hovering
    const handleCursor = getCursorForHandle(hoveredHandleRef.current);
    if (handleCursor && markTool !== 'none') return handleCursor;

    if (markTool === 'brush') return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${brushSize}' height='${brushSize}'%3E%3Ccircle cx='${brushSize/2}' cy='${brushSize/2}' r='${brushSize/2-1}' fill='rgba(255,50,50,0.3)' stroke='%23ef4444' stroke-width='1'/%3E%3C/svg%3E") ${brushSize/2} ${brushSize/2}, crosshair`;
    if (markTool === 'rect') return 'crosshair';
    return 'crosshair';
  };

  // Suppress unused variable warning
  void annotationVersion;

  return (
    <div className="fixed inset-0 no-select" style={{ cursor: getCursor() }}
      onContextMenu={(e) => { e.preventDefault(); handleCancel(); }}>
      <canvas ref={canvasRef} className="w-full h-full"
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} />

      {showToolbar && selection && (
        <SelectionToolbar
          selection={selection} markTool={markTool} brushSize={brushSize} brushColor={brushColor}
          onSetMarkTool={setMarkTool} onSetBrushSize={setBrushSize} onSetBrushColor={setBrushColor}
          onTranslate={handleTranslate}
          onUndo={handleUndo} onRedo={handleRedo}
          canUndo={undoCount > 0} canRedo={redoCount > 0}
          onCopy={async () => {
            const base64 = cropSelection();
            if (base64) {
              try {
                const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager');
                const binaryStr = atob(base64);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                await writeImage(bytes);
              } catch (err) {
                console.error('Failed to copy to clipboard:', err);
                try {
                  const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
                  await writeText(`data:image/png;base64,${base64}`);
                } catch {}
              }
            }
            try { await invoke('close_overlay'); } catch { try { await getCurrentWindow().close(); } catch {} }
          }}
          onSave={async () => {
            const base64 = cropSelection();
            if (base64) {
              try {
                const link = document.createElement('a');
                link.href = `data:image/png;base64,${base64}`;
                link.download = `visiontrans-${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } catch (err) {
                console.error('Failed to save image:', err);
              }
            }
            try { await invoke('close_overlay'); } catch { try { await getCurrentWindow().close(); } catch {} }
          }}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
