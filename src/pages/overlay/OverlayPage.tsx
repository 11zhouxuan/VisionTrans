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
  const [markTool, setMarkTool] = useState<MarkTool>('none');
  const [brushSize, setBrushSize] = useState(12);
  const [brushColor, setBrushColor] = useState('rgba(255, 230, 0, 0.35)');

  // Offscreen canvas for persistent marks (brush strokes + rect marks)
  const markCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMarking = useRef(false);
  const markStart = useRef({ x: 0, y: 0 });

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

    // Create offscreen mark canvas
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

  // Selection hook
  const {
    selection, isDrawing, isResizing,
    onMouseDown, onMouseMove, onMouseUp,
    redraw: baseRedraw, setInitialSelection,
  } = useSelection(canvasRef, bgImage);

  // Enhanced redraw that overlays marks
  const redraw = useCallback(() => {
    baseRedraw();
    // Overlay marks from offscreen canvas
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

  // Set initial selection
  useEffect(() => {
    if (bgImage) {
      const padding = 0.1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      setInitialSelection({
        x: Math.round(w * padding),
        y: Math.round(h * padding),
        width: Math.round(w * (1 - 2 * padding)),
        height: Math.round(h * (1 - 2 * padding)),
      });
      redraw();
    }
  }, [bgImage, setInitialSelection, redraw]);

  const showToolbar = selection && selection.width > MIN_CROP_SIZE && selection.height > MIN_CROP_SIZE && !isDrawing && !isResizing;

  // Mark tool handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (markTool !== 'none' && selection) {
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;
      if (x >= selection.x && x <= selection.x + selection.width &&
          y >= selection.y && y <= selection.y + selection.height) {
        isMarking.current = true;
        markStart.current = { x, y };
        if (markTool === 'brush') {
          // Start brush stroke on mark canvas
          const markCtx = markCanvasRef.current?.getContext('2d');
          if (markCtx) {
            markCtx.beginPath();
            markCtx.moveTo(x, y);
          }
        }
        return;
      }
    }
    onMouseDown(e);
  }, [markTool, selection, onMouseDown]);

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
      } else if (markTool === 'rect') {
        // Preview rect on main canvas (will be finalized on mouseUp)
        redraw();
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          const rx = Math.min(markStart.current.x, x);
          const ry = Math.min(markStart.current.y, y);
          const rw = Math.abs(x - markStart.current.x);
          const rh = Math.abs(y - markStart.current.y);
          ctx.strokeStyle = brushColor;
          ctx.lineWidth = 2;
          ctx.fillStyle = brushColor;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);
        }
        return;
      }
      // Redraw to show brush marks
      redraw();
      return;
    }
    onMouseMove(e);
  }, [markTool, brushColor, brushSize, onMouseMove, redraw]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isMarking.current && markTool !== 'none') {
      if (markTool === 'rect') {
        // Finalize rect on mark canvas
        const x = e.nativeEvent.offsetX;
        const y = e.nativeEvent.offsetY;
        const markCtx = markCanvasRef.current?.getContext('2d');
        if (markCtx) {
          const rx = Math.min(markStart.current.x, x);
          const ry = Math.min(markStart.current.y, y);
          const rw = Math.abs(x - markStart.current.x);
          const rh = Math.abs(y - markStart.current.y);
          markCtx.strokeStyle = brushColor;
          markCtx.lineWidth = 2;
          markCtx.fillStyle = brushColor;
          markCtx.fillRect(rx, ry, rw, rh);
          markCtx.strokeRect(rx, ry, rw, rh);
        }
      }
      isMarking.current = false;
      redraw();
      return;
    }
    onMouseUp();
  }, [markTool, brushColor, onMouseUp, redraw]);

  // Crop selection
  const cropSelection = useCallback((): string | null => {
    if (!selection || !bgImage) return null;
    const dpr = window.devicePixelRatio || 1;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = selection.width * dpr;
    tempCanvas.height = selection.height * dpr;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    // Draw original image
    tempCtx.drawImage(
      bgImage,
      selection.x * dpr, selection.y * dpr,
      selection.width * dpr, selection.height * dpr,
      0, 0, selection.width * dpr, selection.height * dpr
    );

    // Overlay marks
    if (markCanvasRef.current) {
      tempCtx.drawImage(
        markCanvasRef.current,
        selection.x * dpr, selection.y * dpr,
        selection.width * dpr, selection.height * dpr,
        0, 0, selection.width * dpr, selection.height * dpr
      );
    }

    return tempCanvas.toDataURL('image/png').split(',')[1];
  }, [selection, bgImage]);

  const handleTranslate = useCallback(async () => {
    const croppedBase64 = cropSelection();
    if (!croppedBase64 || !selection) return;
    try {
      const pos = { x: selection.x + selection.width + 12, y: selection.y };
      if (pos.x + 380 > window.innerWidth) pos.x = selection.x - 380 - 12;
      if (pos.x < 0) pos.x = 12;
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
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel, handleTranslate, showToolbar]);

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
          selection={selection}
          markTool={markTool}
          brushSize={brushSize}
          brushColor={brushColor}
          onSetMarkTool={setMarkTool}
          onSetBrushSize={setBrushSize}
          onSetBrushColor={setBrushColor}
          onTranslate={handleTranslate}
          onCopy={async () => { cropSelection(); try { await getCurrentWindow().close(); } catch {} }}
          onSave={async () => { cropSelection(); try { await getCurrentWindow().close(); } catch {} }}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
