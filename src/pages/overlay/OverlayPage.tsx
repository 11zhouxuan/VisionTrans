import { useRef, useState, useEffect, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useCanvas } from './hooks/useCanvas';
import { useBrushMode } from './hooks/useBrushMode';
import { useRectMode } from './hooks/useRectMode';
import { useImageCrop } from './hooks/useImageCrop';
import ToolBar from './components/ToolBar';
import type { ScreenshotData } from '../../types/translate';

export default function OverlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'brush' | 'rect'>('brush');
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

  // Initialize canvas with screenshot
  useCanvas(canvasRef, screenshotBase64);

  // Drawing mode hooks
  const brushHandlers = useBrushMode(canvasRef);
  const rectHandlers = useRectMode(canvasRef, screenshotBase64);
  const { cropAndSend } = useImageCrop(canvasRef);

  // Handle mouse up - crop and send for translation
  const handleMouseUp = useCallback(async (e: React.MouseEvent) => {
    const currentHandlers = mode === 'brush' ? brushHandlers : rectHandlers;
    currentHandlers.onMouseUp();

    const points = currentHandlers.getPoints();
    const croppedBase64 = cropAndSend(points);

    if (croppedBase64) {
      try {
        // Notify Rust to start translation
        await invoke('start_translation', {
          imageBase64: croppedBase64,
          position: { x: e.screenX, y: e.screenY }
        });
      } catch (err) {
        console.error('Failed to start translation:', err);
      }

      // Close overlay window
      try {
        await getCurrentWindow().close();
      } catch {
        // Window might already be closing
      }
    }
  }, [mode, brushHandlers, rectHandlers, cropAndSend]);

  // Handle cancel (Esc or right-click)
  const handleCancel = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel]);

  const currentHandlers = mode === 'brush' ? brushHandlers : rectHandlers;

  return (
    <div
      className="fixed inset-0 cursor-crosshair no-select"
      onContextMenu={handleCancel}
    >
      <ToolBar mode={mode} onModeChange={setMode} />
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={currentHandlers.onMouseDown}
        onMouseMove={currentHandlers.onMouseMove}
        onMouseUp={handleMouseUp}
      />
    </div>
  );
}
