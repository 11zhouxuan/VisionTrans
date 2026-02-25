import { useRef, useEffect, useCallback, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useSelection } from './hooks/useSelection';
import SelectionToolbar from './components/SelectionToolbar';
import type { ScreenshotData } from '../../types/translate';
import { MIN_CROP_SIZE } from '../../lib/constants';

type MarkTool = 'none' | 'brush' | 'rect';

export default function OverlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [markTool, setMarkTool] = useState<MarkTool>('rect');
  const [brushSize, setBrushSize] = useState(12);
  const [brushColor, setBrushColor] = useState('rgba(255, 230, 0, 0.35)');

  // Offscreen canvas for persistent marks
  const markCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMarking = useRef(false);
  const markStart = useRef({ x: 0, y: 0 });

  // Undo/Redo history (snapshots of mark canvas)
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const saveSnapshot = useCallback(() => {
    if (!markCanvasRef.current) return;
    const ctx = markCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const snapshot = ctx.getImageData(0, 0, markCanvasRef.current.width, markCanvasRef.current.height);
    undoStack.current.push(snapshot);
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

    const markCanvas = document.createElement('canvas');
    markCanvas.width = canvas.width;
    markCanvas.height = canvas.height;
    const markCtx = markCanvas.getContext('2d');
    if (markCtx) markCtx.scale(dpr, dpr);
    markCanvasRef.current = markCanvas;

    const img = new Image();
    img.onload = () => setBgImage(img);
    img.src = `data:image/png;base64,${screenshotBase64}`;
  }, [screenshotBase64]);

  const {
    selection, isDrawing, isResizing,
    onMouseDown, onMouseMove, onMouseUp,
    redraw: baseRedraw, setInitialSelection, isOnResizeHandle,
  } = useSelection(canvasRef, bgImage);

  // Enhanced redraw that overlays marks
  const redraw = useCallback(() => {
    baseRedraw();
    if (markCanvasRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(markCanvasRef.current, 0, 0);
        ctx.restore();
      }
    }
  }, [baseRedraw]);

  // Undo/Redo handlers (defined after redraw)
  const handleUndo = useCallback(() => {
    if (!markCanvasRef.current || undoStack.current.length === 0) return;
    const ctx = markCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const current = ctx.getImageData(0, 0, markCanvasRef.current.width, markCanvasRef.current.height);
    redoStack.current.push(current);
    const prev = undoStack.current.pop()!;
    ctx.putImageData(prev, 0, 0);
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    redraw();
  }, [redraw]);

  const handleRedo = useCallback(() => {
    if (!markCanvasRef.current || redoStack.current.length === 0) return;
    const ctx = markCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const current = ctx.getImageData(0, 0, markCanvasRef.current.width, markCanvasRef.current.height);
    undoStack.current.push(current);
    const next = redoStack.current.pop()!;
    ctx.putImageData(next, 0, 0);
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    redraw();
  }, [redraw]);

  useEffect(() => {
    if (bgImage) {
      const padding = 0.1; // 10% padding each side = 80% center selection
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

    // Always prioritize resize handles over mark tools
    // This allows users to resize the selection without switching tools
    if (isOnResizeHandle(x, y)) {
      onMouseDown(e);
      return;
    }

    if (markTool !== 'none' && selection) {
      if (x >= selection.x && x <= selection.x + selection.width &&
          y >= selection.y && y <= selection.y + selection.height) {
        // Save snapshot before marking
        saveSnapshot();
        isMarking.current = true;
        markStart.current = { x, y };
        if (markTool === 'brush') {
          const markCtx = markCanvasRef.current?.getContext('2d');
          if (markCtx) { markCtx.beginPath(); markCtx.moveTo(x, y); }
        }
        return;
      }
    }
    onMouseDown(e);
  }, [markTool, selection, onMouseDown, saveSnapshot, isOnResizeHandle]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isMarking.current && markTool !== 'none') {
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;

      if (markTool === 'brush') {
        const markCtx = markCanvasRef.current?.getContext('2d');
        if (markCtx) {
          markCtx.strokeStyle = brushColor;
          markCtx.lineWidth = brushSize;
          markCtx.lineCap = 'round';
          markCtx.lineJoin = 'round';
          markCtx.lineTo(x, y);
          markCtx.stroke();
          markCtx.beginPath();
          markCtx.moveTo(x, y);
        }
        redraw();
      } else if (markTool === 'rect') {
        // Preview rect on main canvas
        redraw();
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          const rx = Math.min(markStart.current.x, x);
          const ry = Math.min(markStart.current.y, y);
          const rw = Math.abs(x - markStart.current.x);
          const rh = Math.abs(y - markStart.current.y);
          ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.strokeRect(rx, ry, rw, rh);
        }
      }
      return;
    }
    onMouseMove(e);
  }, [markTool, brushColor, brushSize, onMouseMove, redraw]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isMarking.current && markTool !== 'none') {
      if (markTool === 'rect') {
        const x = e.nativeEvent.offsetX;
        const y = e.nativeEvent.offsetY;
        const markCtx = markCanvasRef.current?.getContext('2d');
        if (markCtx) {
          const rx = Math.min(markStart.current.x, x);
          const ry = Math.min(markStart.current.y, y);
          const rw = Math.abs(x - markStart.current.x);
          const rh = Math.abs(y - markStart.current.y);
          // Border only, red color
          markCtx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
          markCtx.lineWidth = 2;
          markCtx.setLineDash([]);
          markCtx.strokeRect(rx, ry, rw, rh);
        }
      }
      isMarking.current = false;
      redraw();
      return;
    }
    onMouseUp();
  }, [markTool, onMouseUp, redraw]);

  const cropSelection = useCallback((): string | null => {
    if (!selection || !bgImage) return null;
    const dpr = window.devicePixelRatio || 1;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = selection.width * dpr;
    tempCanvas.height = selection.height * dpr;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;
    tempCtx.drawImage(bgImage, selection.x * dpr, selection.y * dpr, selection.width * dpr, selection.height * dpr, 0, 0, selection.width * dpr, selection.height * dpr);
    if (markCanvasRef.current) {
      tempCtx.drawImage(markCanvasRef.current, selection.x * dpr, selection.y * dpr, selection.width * dpr, selection.height * dpr, 0, 0, selection.width * dpr, selection.height * dpr);
    }
    return tempCanvas.toDataURL('image/png').split(',')[1];
  }, [selection, bgImage]);

  const handleTranslate = useCallback(async () => {
    const croppedBase64 = cropSelection();
    if (!croppedBase64 || !selection) return;
    try {
      // Fixed position at top-left corner
      const pos = { x: 24, y: 24 };
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
    if (markTool === 'brush') return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${brushSize}' height='${brushSize}'%3E%3Ccircle cx='${brushSize/2}' cy='${brushSize/2}' r='${brushSize/2-1}' fill='rgba(255,230,0,0.3)' stroke='%23fbbf24' stroke-width='1'/%3E%3C/svg%3E") ${brushSize/2} ${brushSize/2}, crosshair`;
    if (markTool === 'rect') return 'crosshair';
    return 'crosshair';
  };

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
          onCopy={async () => { cropSelection(); try { await getCurrentWindow().close(); } catch {} }}
          onSave={async () => { cropSelection(); try { await getCurrentWindow().close(); } catch {} }}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
