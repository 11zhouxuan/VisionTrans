import { useRef, useState, useEffect, useCallback } from 'react';
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
  const [highlightMode, setHighlightMode] = useState(false);

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

  // Selection hook
  const {
    selection, isDrawing, isResizing,
    onMouseDown, onMouseMove, onMouseUp,
    redraw,
  } = useSelection(canvasRef, bgImage);

  // Initial draw when bgImage loads
  useEffect(() => {
    if (bgImage) redraw();
  }, [bgImage, redraw]);

  // Show toolbar when selection is complete and not actively drawing/resizing
  const showToolbar = selection && selection.width > MIN_CROP_SIZE && selection.height > MIN_CROP_SIZE && !isDrawing && !isResizing;

  // Highlight drawing state
  const isHighlighting = useRef(false);
  const highlightPoints = useRef<Array<{x: number; y: number}>>([]);

  // Handle mouse events - either selection or highlight mode
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (highlightMode && selection) {
      // Start highlighting inside selection
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;
      if (x >= selection.x && x <= selection.x + selection.width &&
          y >= selection.y && y <= selection.y + selection.height) {
        isHighlighting.current = true;
        highlightPoints.current = [{ x, y }];
        return;
      }
    }
    onMouseDown(e);
  }, [highlightMode, selection, onMouseDown]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isHighlighting.current && highlightMode) {
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;
      highlightPoints.current.push({ x, y });

      // Draw highlight stroke on canvas
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && highlightPoints.current.length >= 2) {
        const prev = highlightPoints.current[highlightPoints.current.length - 2];
        const curr = highlightPoints.current[highlightPoints.current.length - 1];
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 230, 0, 0.35)';
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
      return;
    }
    onMouseMove(e);
  }, [highlightMode, onMouseMove]);

  const handleMouseUp = useCallback(() => {
    if (isHighlighting.current) {
      isHighlighting.current = false;
      return;
    }
    onMouseUp();
  }, [onMouseUp]);

  // Crop selection area from the canvas (includes highlights)
  const cropSelection = useCallback((): string | null => {
    if (!selection || !canvasRef.current) return null;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return null;

    // Get image data from the canvas (which includes any highlight marks)
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

  // Handle translate
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

    try {
      await getCurrentWindow().close();
    } catch {}
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && showToolbar) {
        handleTranslate();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel, handleTranslate, showToolbar]);

  return (
    <div
      className="fixed inset-0 no-select"
      style={{ cursor: highlightMode && selection ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'10\' fill=\'rgba(255,230,0,0.4)\' stroke=\'%23fbbf24\' stroke-width=\'1\'/%3E%3C/svg%3E") 12 12, crosshair' : 'crosshair' }}
      onContextMenu={(e) => { e.preventDefault(); handleCancel(); }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />

      {/* Selection toolbar */}
      {showToolbar && selection && (
        <SelectionToolbar
          selection={selection}
          highlightMode={highlightMode}
          onToggleHighlight={() => setHighlightMode(!highlightMode)}
          onTranslate={handleTranslate}
          onCopy={handleCopy}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
