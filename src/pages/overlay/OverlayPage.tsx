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

  // Show toolbar when selection is complete
  const showToolbar = selection && selection.width > MIN_CROP_SIZE && selection.height > MIN_CROP_SIZE && !isDrawing && !isResizing;

  // Crop selection area from the original image (clean, no overlays)
  const cropSelection = useCallback((): string | null => {
    if (!selection || !bgImage) return null;
    const dpr = window.devicePixelRatio || 1;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = selection.width * dpr;
    tempCanvas.height = selection.height * dpr;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    // Draw from the original image directly (clean, no overlays/handles)
    tempCtx.drawImage(
      bgImage,
      selection.x * dpr, selection.y * dpr,
      selection.width * dpr, selection.height * dpr,
      0, 0,
      selection.width * dpr, selection.height * dpr
    );

    return tempCanvas.toDataURL('image/png').split(',')[1];
  }, [selection, bgImage]);

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
      style={{ cursor: 'crosshair' }}
      onContextMenu={(e) => { e.preventDefault(); handleCancel(); }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      />

      {/* Selection toolbar */}
      {showToolbar && selection && (
        <SelectionToolbar
          selection={selection}
          onTranslate={handleTranslate}
          onCopy={handleCopy}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
