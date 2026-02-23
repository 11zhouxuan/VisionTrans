import { useRef, useEffect, useCallback, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useSelection } from './hooks/useSelection';
import SelectionToolbar from './components/SelectionToolbar';
import type { ScreenshotData } from '../../types/translate';
import { MIN_CROP_SIZE } from '../../lib/constants';

export default function OverlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [brushMode, setBrushMode] = useState(false);
  const brushPoints = useRef<Array<{x: number; y: number}>>([]);
  const isBrushing = useRef(false);

  // Fetch screenshot data from Rust backend
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

  // Load background image and initialize canvas
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
    img.onload = () => {
      setBgImage(img);
    };
    img.src = `data:image/png;base64,${screenshotBase64}`;
  }, [screenshotBase64]);

  // Selection hook - starts with full screen selected
  const {
    selection, isDrawing, isResizing,
    onMouseDown, onMouseMove, onMouseUp,
    redraw, setInitialSelection,
  } = useSelection(canvasRef, bgImage);

  // Set initial full-screen selection when bgImage loads
  useEffect(() => {
    if (bgImage) {
      setInitialSelection({
        x: 0, y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      });
      redraw();
    }
  }, [bgImage, setInitialSelection, redraw]);

  // Show toolbar when selection exists
  const showToolbar = selection && selection.width > MIN_CROP_SIZE && selection.height > MIN_CROP_SIZE && !isDrawing && !isResizing;

  // Brush drawing handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (brushMode && selection) {
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;
      // Only brush inside selection
      if (x >= selection.x && x <= selection.x + selection.width &&
          y >= selection.y && y <= selection.y + selection.height) {
        isBrushing.current = true;
        brushPoints.current = [{ x, y }];
        return;
      }
    }
    onMouseDown(e);
  }, [brushMode, selection, onMouseDown]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isBrushing.current && brushMode) {
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;
      brushPoints.current.push({ x, y });

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && brushPoints.current.length >= 2) {
        const prev = brushPoints.current[brushPoints.current.length - 2];
        const curr = brushPoints.current[brushPoints.current.length - 1];
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 230, 0, 0.25)';
        ctx.lineWidth = 24;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
      return;
    }
    onMouseMove(e);
  }, [brushMode, onMouseMove]);

  const handleMouseUp = useCallback(() => {
    if (isBrushing.current) {
      isBrushing.current = false;
      return;
    }
    onMouseUp();
  }, [onMouseUp]);

  // Crop: send the full selection area (with brush marks as context)
  const cropSelection = useCallback((): string | null => {
    if (!selection || !canvasRef.current) return null;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return null;

    // Get from canvas which includes brush marks
    const imageData = ctx.getImageData(
      selection.x * dpr, selection.y * dpr,
      selection.width * dpr, selection.height * dpr
    );

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = selection.width * dpr;
    tempCanvas.height = selection.height * dpr;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;
    tempCtx.putImageData(imageData, 0, 0);

    return tempCanvas.toDataURL('image/png').split(',')[1];
  }, [selection]);

  const handleTranslate = useCallback(async () => {
    const croppedBase64 = cropSelection();
    if (!croppedBase64 || !selection) return;

    try {
      const pos = {
        x: selection.x + selection.width + 12,
        y: selection.y,
      };
      if (pos.x + 380 > window.innerWidth) {
        pos.x = selection.x - 380 - 12;
      }
      if (pos.x < 0) pos.x = 12;

      await invoke('start_translation', {
        imageBase64: croppedBase64,
        position: pos,
      });
    } catch (err) {
      console.error('Failed to start translation:', err);
    }

    try { await getCurrentWindow().close(); } catch {}
  }, [cropSelection, selection]);

  const handleCopy = useCallback(async () => {
    cropSelection();
    try { await getCurrentWindow().close(); } catch {}
  }, [cropSelection]);

  const handleSave = useCallback(async () => {
    cropSelection();
    try { await getCurrentWindow().close(); } catch {}
  }, [cropSelection]);

  const handleCancel = useCallback(async () => {
    try {
      await invoke('close_overlay');
    } catch {
      await getCurrentWindow().close();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
      else if (e.key === 'Enter' && showToolbar) handleTranslate();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel, handleTranslate, showToolbar]);

  return (
    <div
      className="fixed inset-0 no-select"
      style={{ cursor: brushMode ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'10\' fill=\'rgba(255,230,0,0.3)\' stroke=\'%23fbbf24\' stroke-width=\'1\'/%3E%3C/svg%3E") 12 12, crosshair' : 'crosshair' }}
      onContextMenu={(e) => { e.preventDefault(); handleCancel(); }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />

      {showToolbar && selection && (
        <SelectionToolbar
          selection={selection}
          brushMode={brushMode}
          onToggleBrush={() => setBrushMode(!brushMode)}
          onTranslate={handleTranslate}
          onCopy={handleCopy}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
