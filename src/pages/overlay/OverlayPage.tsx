import { useRef, useState, useEffect, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useSelection } from './hooks/useSelection';
import Magnifier from './components/Magnifier';
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
    redraw, mousePos,
  } = useSelection(canvasRef, bgImage);

  // Initial draw when bgImage loads
  useEffect(() => {
    if (bgImage) redraw();
  }, [bgImage, redraw]);

  // Show toolbar when selection is complete and not actively drawing/resizing
  const showToolbar = selection && selection.width > MIN_CROP_SIZE && selection.height > MIN_CROP_SIZE && !isDrawing && !isResizing;

  // Show magnifier when no selection yet or actively drawing
  const showMagnifier = !selection || isDrawing;

  // Crop selection area from the original screenshot
  const cropSelection = useCallback((): string | null => {
    if (!selection || !bgImage) return null;
    const dpr = window.devicePixelRatio || 1;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = selection.width * dpr;
    tempCanvas.height = selection.height * dpr;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    // Draw from the original image (which is in physical pixels)
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
      // Smart position: place result card next to selection, not overlapping
      const pos = {
        x: selection.x + selection.width + 12,
        y: selection.y,
      };
      // If card would go off right edge, place it to the left
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
    } catch {
      // Window might already be closing
    }
  }, [cropSelection, selection]);

  // Handle copy screenshot
  const handleCopy = useCallback(async () => {
    const croppedBase64 = cropSelection();
    if (!croppedBase64) return;
    // TODO: Copy image to clipboard via Rust
    // For now, close overlay
    try {
      await getCurrentWindow().close();
    } catch {}
  }, [cropSelection]);

  // Handle save screenshot
  const handleSave = useCallback(async () => {
    const croppedBase64 = cropSelection();
    if (!croppedBase64) return;
    // TODO: Save image to file via Rust
    try {
      await getCurrentWindow().close();
    } catch {}
  }, [cropSelection]);

  // Handle cancel
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

      {/* Magnifier - shows when no selection or actively drawing */}
      <Magnifier
        mouseX={mousePos.x}
        mouseY={mousePos.y}
        bgImage={bgImage}
        visible={showMagnifier}
      />

      {/* Selection toolbar - shows after selection is complete */}
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
