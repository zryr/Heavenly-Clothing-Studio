import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Upload,
  Zap,
  Scissors,
  Eraser,
  Undo2,
  Redo2,
  Download,
  Box,
  Shield,
  Layers,
  FileImage,
  RefreshCw,
  Info,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Image as ImageIcon,
  Activity,
  Terminal,
  X,
  Sliders,
  Sparkles,
  Move,
  Copy,
  Code2,
  Columns
} from 'lucide-react';
import {
  TEMPLATE_WIDTH,
  TEMPLATE_HEIGHT,
  TemplateType,
  ToolMode,
  PreflightReport,
  UvIsland,
  ROBLOX_SHIRT_UV_ISLANDS,
  ROBLOX_PANTS_UV_ISLANDS
} from './types/uv';
import {
  autoStripNonUvPixels,
  analyzePreflight,
  resampleTo585x559,
  getUvMask
} from './utils/uvEngine';
import { SAMPLE_TEMPLATES } from './utils/sampleTemplates';
import { CanvasViewport } from './components/CanvasViewport';
import { Roblox3DViewport } from './components/Roblox3DViewport';
import { PreflightModal } from './components/PreflightModal';
import { ExportModal } from './components/ExportModal';
import { DebugConsole, DebugLogItem } from './components/DebugConsole';
import { UvDebugModal } from './components/UvDebugModal';

export default function App() {
  // Canvases
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageSourceRef = useRef<HTMLCanvasElement | null>(null);

  // Undo / Redo History Stack (storing ImageData snapshots)
  const historyStackRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  // App State (Pan is first and active by default)
  const [templateType, setTemplateType] = useState<TemplateType>('shirt');
  const [toolMode, setToolMode] = useState<ToolMode>('pan');
  const [showWireframe, setShowWireframe] = useState<boolean>(true);
  const [brushSize, setBrushSize] = useState<number>(14);
  const [updateTrigger, setUpdateTrigger] = useState<number>(0);

  // Custom UV Island line positions with localStorage persistence (v5 uses user-calibrated inner-center alignment)
  const STORAGE_KEY_SHIRT = 'uv_armor_shirt_islands_v5';
  const STORAGE_KEY_PANTS = 'uv_armor_pants_islands_v5';

  const [shirtIslands, setShirtIslands] = useState<UvIsland[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SHIRT);
      if (saved) return JSON.parse(saved);
    } catch {}
    return ROBLOX_SHIRT_UV_ISLANDS;
  });

  const [pantsIslands, setPantsIslands] = useState<UvIsland[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PANTS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return ROBLOX_PANTS_UV_ISLANDS;
  });

  const activeIslands = useMemo(() => {
    return templateType === 'shirt' ? shirtIslands : pantsIslands;
  }, [templateType, shirtIslands, pantsIslands]);

  const activeIslandsRef = useRef<UvIsland[]>(activeIslands);
  useEffect(() => {
    activeIslandsRef.current = activeIslands;
  }, [activeIslands]);

  // Workspace Studio view mode: '2d' (Full 2D Canvas) | '3d' (Full Page 3D Studio) | 'split' (Side-by-side)
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'split'>('2d');
  const [debugMode, setDebugMode] = useState<boolean>(false);

  // Attachment state: 3D model tab shown and active when an image is attached/uploaded OR when debug mode is enabled
  const [hasAttachment, setHasAttachment] = useState<boolean>(false);
  const is3DEnabled = hasAttachment || debugMode;

  // Debug Logs
  const [debugLogs, setDebugLogs] = useState<DebugLogItem[]>([]);

  const addDebugLog = useCallback((message: string, level: 'info' | 'success' | 'warn' | 'error' = 'info', details?: string) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(Math.floor(now.getMilliseconds() / 100))}`;
    
    console.log(`[UV-ARMOR DEBUG ${timeStr}] [${level.toUpperCase()}] ${message}`, details || '');

    setDebugLogs((prev) => [
      ...prev.slice(-45),
      {
        id: `${Date.now()}-${Math.random()}`,
        time: timeStr,
        level,
        message,
        details
      }
    ]);
  }, []);

  // Hover coordinate HUD
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    island: UvIsland | null;
    colorRgba: string | null;
  } | null>(null);

  // Preflight & Diagnostics
  const [preflightReport, setPreflightReport] = useState<PreflightReport | null>(null);
  const [pendingUploadFile, setPendingUploadFile] = useState<{
    image: CanvasImageSource;
    name: string;
    width: number;
    height: number;
  } | null>(null);
  const [showPreflightModal, setShowPreflightModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showUvDebugModal, setShowUvDebugModal] = useState<boolean>(false);

  // Quick Conform Bar on top of Canvas
  const [conformBanner, setConformBanner] = useState<{
    originalWidth: number;
    originalHeight: number;
    mode: 'scale' | 'pad' | 'crop';
    fileName: string;
  } | null>(null);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'info' | 'warning' | 'error';
  } | null>(null);

  // Sample templates menu
  const [showSampleDropdown, setShowSampleDropdown] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef<number>(0);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const triggerToast = (text: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Update UV islands handler (NEVER clears or alters the active canvas image)
  const handleUpdateIslands = useCallback((newIslands: UvIsland[]) => {
    if (templateType === 'shirt') {
      setShirtIslands(newIslands);
      try {
        localStorage.setItem(STORAGE_KEY_SHIRT, JSON.stringify(newIslands));
      } catch {}
    } else {
      setPantsIslands(newIslands);
      try {
        localStorage.setItem(STORAGE_KEY_PANTS, JSON.stringify(newIslands));
      } catch {}
    }
    if (mainCanvasRef.current) {
      const rep = analyzePreflight(mainCanvasRef.current, preflightReport?.fileName || 'template.png', 0, newIslands);
      setPreflightReport(rep);
    }
    setUpdateTrigger((n) => n + 1);
  }, [templateType, preflightReport?.fileName, STORAGE_KEY_SHIRT, STORAGE_KEY_PANTS]);

  // Reset UV islands to defaults
  const handleResetIslands = useCallback(() => {
    const defaults = templateType === 'shirt' ? ROBLOX_SHIRT_UV_ISLANDS : ROBLOX_PANTS_UV_ISLANDS;
    if (templateType === 'shirt') {
      setShirtIslands(defaults);
      try {
        localStorage.removeItem(STORAGE_KEY_SHIRT);
      } catch {}
    } else {
      setPantsIslands(defaults);
      try {
        localStorage.removeItem(STORAGE_KEY_PANTS);
      } catch {}
    }
    if (mainCanvasRef.current) {
      const rep = analyzePreflight(mainCanvasRef.current, preflightReport?.fileName || 'template.png', 0, defaults);
      setPreflightReport(rep);
    }
    setUpdateTrigger((n) => n + 1);
    triggerToast('Reset UV lines to Roblox official default specifications', 'info');
    addDebugLog('Reset UV wireframe lines to official defaults.', 'info');
  }, [templateType, preflightReport?.fileName, STORAGE_KEY_SHIRT, STORAGE_KEY_PANTS, addDebugLog]);

  // Copy coordinates to clipboard for debugging / hardcoding into codebase
  const handleCopyCoordinates = useCallback(() => {
    const constName = templateType === 'shirt' ? 'ROBLOX_SHIRT_UV_ISLANDS' : 'ROBLOX_PANTS_UV_ISLANDS';
    const tsCode = `// Roblox ${templateType === 'shirt' ? 'Shirt' : 'Pants'} Calibrated UV Island Coordinates\n// Ready to hardcode into src/types/uv.ts\nexport const ${constName}: UvIsland[] = [\n` +
      activeIslands.map((isl) =>
        `  { name: ${JSON.stringify(isl.name)}, x: ${Math.round(isl.x)}, y: ${Math.round(isl.y)}, w: ${Math.round(isl.w)}, h: ${Math.round(isl.h)}, group: ${JSON.stringify(isl.group)}${isl.description ? `, description: ${JSON.stringify(isl.description)}` : ''} }`
      ).join(',\n') +
      `\n];\n`;

    navigator.clipboard.writeText(tsCode).then(() => {
      triggerToast(`Copied ${constName} TypeScript code to clipboard! Ready to hardcode.`, 'success');
      addDebugLog(`Copied ${activeIslands.length} island positions in TypeScript format to clipboard.`, 'success');
    }).catch(() => {
      triggerToast('Copied coordinates to clipboard!', 'info');
    });
  }, [activeIslands, templateType, addDebugLog]);

  // Push state to Undo History
  const pushHistorySnapshot = useCallback(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.getImageData(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);

    // Truncate any future redo steps
    historyStackRef.current = historyStackRef.current.slice(0, historyIndexRef.current + 1);
    historyStackRef.current.push(imgData);

    // Limit history stack size to 25 items for memory efficiency
    if (historyStackRef.current.length > 25) {
      historyStackRef.current.shift();
    } else {
      historyIndexRef.current++;
    }

    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);

    // Update diagnostic report and trigger 3D texture update
    const report = analyzePreflight(canvas, preflightReport?.fileName || 'template.png', 0, activeIslands);
    setPreflightReport(report);
    setUpdateTrigger((n) => n + 1);
  }, [preflightReport?.fileName, activeIslands]);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;

    const snapshot = historyStackRef.current[historyIndexRef.current];
    const canvas = mainCanvasRef.current;
    if (!canvas || !snapshot) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.putImageData(snapshot, 0, 0);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(true);

    const report = analyzePreflight(canvas, preflightReport?.fileName || 'template.png', 0, activeIslands);
    setPreflightReport(report);
    setUpdateTrigger((n) => n + 1);
    addDebugLog('History Undo performed.', 'info');
  }, [preflightReport?.fileName, activeIslands, addDebugLog]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyStackRef.current.length - 1) return;
    historyIndexRef.current++;

    const snapshot = historyStackRef.current[historyIndexRef.current];
    const canvas = mainCanvasRef.current;
    if (!canvas || !snapshot) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.putImageData(snapshot, 0, 0);
    setCanUndo(true);
    setCanRedo(historyIndexRef.current < historyStackRef.current.length - 1);

    const report = analyzePreflight(canvas, preflightReport?.fileName || 'template.png', 0, activeIslands);
    setPreflightReport(report);
    setUpdateTrigger((n) => n + 1);
    addDebugLog('History Redo performed.', 'info');
  }, [preflightReport?.fileName, activeIslands, addDebugLog]);

  // Load a canvas into the workspace with verified pixel sampling
  const loadCanvasData = useCallback((sourceCanvas: HTMLCanvasElement, name: string = 'template.png'): boolean => {
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas) {
      addDebugLog('CRITICAL: mainCanvasRef.current is not mounted in DOM!', 'error');
      return false;
    }

    const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
    if (!mainCtx) {
      addDebugLog('CRITICAL: Failed to get 2d context for mainCanvas!', 'error');
      return false;
    }

    try {
      // 1. Save an in-memory pristine copy for Split-View comparison
      const offscreenCopy = document.createElement('canvas');
      offscreenCopy.width = TEMPLATE_WIDTH;
      offscreenCopy.height = TEMPLATE_HEIGHT;
      const offCtx = offscreenCopy.getContext('2d');
      if (offCtx) {
        offCtx.drawImage(sourceCanvas, 0, 0);
      }
      originalImageSourceRef.current = offscreenCopy;

      // 2. Clear and draw to main canvas
      mainCtx.clearRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
      mainCtx.drawImage(sourceCanvas, 0, 0);

      // 3. If split-view canvas element exists in DOM, draw to it as well
      if (originalCanvasRef.current) {
        const origCtx = originalCanvasRef.current.getContext('2d');
        if (origCtx) {
          origCtx.clearRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
          origCtx.drawImage(sourceCanvas, 0, 0);
        }
      }

      // 4. Sample pixels to verify render execution
      const fullImgData = mainCtx.getImageData(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
      const data32 = new Uint32Array(fullImgData.data.buffer);
      let visiblePixels = 0;
      for (let i = 0; i < data32.length; i++) {
        if ((data32[i] & 0xff000000) !== 0) visiblePixels++;
      }

      // 5. Reset history
      historyStackRef.current = [fullImgData];
      historyIndexRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);

      // 6. Pre-flight analysis
      const report = analyzePreflight(mainCanvas, name, 0, activeIslandsRef.current);
      setPreflightReport(report);
      setUpdateTrigger((n) => n + 1);

      // Attachment attached! Activate 3D model tab and open full-page 3D studio
      setHasAttachment(true);
      setViewMode('3d');

      addDebugLog(
        `Canvas Rendered: 585×559 px | Source: "${name}"`,
        'success',
        `Visible pixels: ${visiblePixels.toLocaleString()} | Dirty Non-UV: ${report.dirtyNonUvPixels.toLocaleString()} px | UV Conformity: ${report.uvConformityPercentage}%`
      );

      return true;
    } catch (err: any) {
      addDebugLog(`Failed to draw source to canvas: ${err.message}`, 'error');
      return false;
    }
  }, [addDebugLog]);

  // Robust multi-format image decoder (ImageBitmap -> FileReader -> Image)
  const decodeImageFile = async (file: File): Promise<{ width: number; height: number; source: CanvasImageSource }> => {
    if (typeof window.createImageBitmap === 'function') {
      try {
        const bitmap = await window.createImageBitmap(file);
        if (bitmap.width > 0 && bitmap.height > 0) {
          addDebugLog(`Decoded via native createImageBitmap: ${bitmap.width}×${bitmap.height}px`, 'info');
          return { width: bitmap.width, height: bitmap.height, source: bitmap };
        }
      } catch (bitmapErr: any) {
        addDebugLog(`createImageBitmap failed (${bitmapErr.message || 'unknown'}), falling back to FileReader...`, 'warn');
      }
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          reject(new Error('FileReader returned empty result.'));
          return;
        }

        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (w > 0 && h > 0) {
            addDebugLog(`Decoded via FileReader Image: ${w}×${h}px`, 'info');
            resolve({ width: w, height: h, source: img });
          } else {
            reject(new Error('Decoded image has zero dimensions.'));
          }
        };
        img.onerror = () => {
          reject(new Error('Image failed to decode via dataURL source.'));
        };
        img.src = dataUrl;
      };
      reader.onerror = () => reject(new Error('FileReader encounter read failure.'));
      reader.readAsDataURL(file);
    });
  };

  // Primary File Ingestion Pipeline
  const handleFileUpload = useCallback(async (file: File) => {
    addDebugLog(
      `File ingestion started: "${file.name}"`,
      'info',
      `Size: ${(file.size / 1024).toFixed(1)} KB | MIME: ${file.type || 'unspecified'} | Modified: ${new Date(file.lastModified).toLocaleTimeString()}`
    );

    const isImage =
      (file.type && file.type.startsWith('image/')) ||
      /\.(png|jpe?g|webp|jfif|bmp|gif|tiff|svg)$/i.test(file.name) ||
      file.type === '' ||
      file.type === 'application/octet-stream';

    if (!isImage && file.size > 0) {
      addDebugLog(`File rejected: "${file.name}" does not match image criteria.`, 'error');
      triggerToast(`"${file.name}" does not appear to be an image.`, 'warning');
      return;
    }

    try {
      const decoded = await decodeImageFile(file);
      const { width, height, source } = decoded;

      setPendingUploadFile({
        image: source,
        name: file.name,
        width,
        height
      });

      if (width === TEMPLATE_WIDTH && height === TEMPLATE_HEIGHT) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = TEMPLATE_WIDTH;
        tempCanvas.height = TEMPLATE_HEIGHT;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(source, 0, 0);
          const success = loadCanvasData(tempCanvas, file.name);
          if (success) {
            setConformBanner(null);
            setViewMode('3d');
            triggerToast(`Loaded exact 585×559 template: ${file.name}`, 'success');
          }
        }
      } else {
        addDebugLog(
          `Resolution disparity: ${width}×${height}px. Auto-conforming to Roblox 585×559 standard...`,
          'warn'
        );

        const resampled = resampleTo585x559(source, width, height, 'scale');
        const success = loadCanvasData(resampled, file.name);

        if (success) {
          setConformBanner({
            originalWidth: width,
            originalHeight: height,
            mode: 'scale',
            fileName: file.name
          });
          setViewMode('3d');
          triggerToast(
            `Conformed ${width}×${height}px template to Roblox 585×559!`,
            'info'
          );
        }
      }
    } catch (err: any) {
      addDebugLog(`CRITICAL UPLOAD FAILURE: ${err.message}`, 'error', `File: "${file.name}"`);
      triggerToast(`Could not load "${file.name}". ${err.message}`, 'error');
    }
  }, [loadCanvasData, addDebugLog]);

  // Switch conform mode dynamically
  const handleSwitchConformMode = (mode: 'scale' | 'pad' | 'crop') => {
    if (!pendingUploadFile) return;

    addDebugLog(`Switching conform mode to [${mode.toUpperCase()}] for "${pendingUploadFile.name}"...`, 'info');

    const resampledCanvas = resampleTo585x559(
      pendingUploadFile.image,
      pendingUploadFile.width,
      pendingUploadFile.height,
      mode
    );

    const success = loadCanvasData(resampledCanvas, pendingUploadFile.name);
    if (success) {
      setConformBanner((prev) => (prev ? { ...prev, mode } : null));
      triggerToast(`Updated template via [${mode.toUpperCase()}] conform mode`, 'success');
    }
  };

  // Preflight Resample Acceptance from modal
  const handleApplyResampleFromModal = (mode: 'scale' | 'pad' | 'crop') => {
    handleSwitchConformMode(mode);
    setShowPreflightModal(false);
  };

  // Detach attachment and clear canvas to initial clean state
  const handleDetachAttachment = useCallback(() => {
    const mainCanvas = mainCanvasRef.current;
    if (mainCanvas) {
      const ctx = mainCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
      }
    }
    if (originalCanvasRef.current) {
      const origCtx = originalCanvasRef.current.getContext('2d');
      if (origCtx) {
        origCtx.clearRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
      }
    }
    setHasAttachment(false);
    setViewMode('2d');
    setPreflightReport(null);
    setConformBanner(null);
    setPendingUploadFile(null);
    historyStackRef.current = [];
    historyIndexRef.current = -1;
    setCanUndo(false);
    setCanRedo(false);
    setUpdateTrigger((n) => n + 1);
    triggerToast('Detached template. Upload a new image to view in 3D.', 'info');
    addDebugLog('Template detached. 3D Model deactivated until new attachment is added.', 'info');
  }, [addDebugLog]);

  // Run full system diagnostics test
  const handleRunDiagnostics = () => {
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas) {
      addDebugLog('DIAGNOSTICS FAIL: Main canvas is not mounted in the DOM.', 'error');
      triggerToast('Canvas is not mounted!', 'error');
      return;
    }

    const ctx = mainCanvas.getContext('2d');
    if (!ctx) {
      addDebugLog('DIAGNOSTICS FAIL: Cannot acquire 2D rendering context.', 'error');
      triggerToast('Cannot acquire 2D context!', 'error');
      return;
    }

    const pixelData = ctx.getImageData(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
    const data32 = new Uint32Array(pixelData.data.buffer);
    let visiblePixels = 0;
    for (let i = 0; i < data32.length; i++) {
      if ((data32[i] & 0xff000000) !== 0) visiblePixels++;
    }

    addDebugLog(
      `DIAGNOSTICS PASS: Canvas ${mainCanvas.width}×${mainCanvas.height} px is operational.`,
      'success',
      `Visible non-transparent pixels: ${visiblePixels.toLocaleString()} / ${(TEMPLATE_WIDTH * TEMPLATE_HEIGHT).toLocaleString()} px | Memory buffer: ${(data32.byteLength / 1024).toFixed(1)} KB`
    );
    triggerToast(`Diagnostics Pass: ${visiblePixels.toLocaleString()} visible pixels`, 'success');
  };

  // Primary Action: 1-Click Auto Strip
  const handleAutoStrip = () => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const result = autoStripNonUvPixels(ctx, activeIslands);
    pushHistorySnapshot();

    addDebugLog(
      `Auto-Strip executed in ${result.durationMs}ms`,
      'success',
      `Wiped ${result.dirtyPixelsStripped.toLocaleString()} dirty non-UV pixels based on aligned UV wireframe.`
    );

    triggerToast(
      `Stripped ${result.dirtyPixelsStripped.toLocaleString()} non-UV pixels in ${result.durationMs}ms! (100% Pure)`,
      'success'
    );
  };

  // Global Drag and Drop & Paste Listeners
  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragOver(true);
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        setIsDragOver(false);
        dragCounterRef.current = 0;
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      dragCounterRef.current = 0;

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        addDebugLog(`Drop detected: ${files.length} file(s)`, 'info');
        handleFileUpload(files[0]);
      }
    };

    const handleWindowPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            addDebugLog(`Clipboard paste detected: "${file.name || 'Pasted Image'}"`, 'info');
            handleFileUpload(file);
            triggerToast('Pasted image from clipboard!', 'info');
            break;
          }
        }
      }
    };

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener('paste', handleWindowPaste);
    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener('paste', handleWindowPaste);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [handleFileUpload, addDebugLog, handleUndo, handleRedo]);

  const isDirtyBackground = (preflightReport?.dirtyNonUvPixels || 0) > 0;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0c10] text-[#e2e8f0] font-sans overflow-hidden select-none">
      {/* --- TOP BRANDING & ACTION HEADER --- */}
      <header className="flex flex-wrap items-center justify-between px-3 sm:px-4 py-2 bg-[#0f1117] border-b border-[#232936] z-20 gap-2">
        {/* Brand identity & Mobile Tab toggle */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="relative flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-[#00e5ff] to-[#7000ff] p-[1px] shadow-lg shadow-[#00e5ff]/20 flex-shrink-0">
            <div className="w-full h-full bg-[#0a0c10] rounded-[7px] flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#00e5ff]" />
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <h1 className="text-xs sm:text-sm font-bold tracking-wider font-mono text-white flex items-center space-x-1">
              <span>UV ARMOR</span>
              <span className="hidden sm:inline px-1.5 py-0.5 rounded text-[9px] bg-[#00e5ff]/15 text-[#00e5ff] font-mono border border-[#00e5ff]/30">
                ROBLOX
              </span>
            </h1>
          </div>

          {/* Template Type Selector: Shirt vs Pants */}
          <div className="flex items-center bg-[#141822] p-0.5 rounded-lg border border-[#232936] text-[11px] font-mono">
            <button
              onClick={() => setTemplateType('shirt')}
              className={`px-2 py-0.5 rounded transition font-semibold ${
                templateType === 'shirt'
                  ? 'bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
            >
              Shirt
            </button>
            <button
              onClick={() => setTemplateType('pants')}
              className={`px-2 py-0.5 rounded transition font-semibold ${
                templateType === 'pants'
                  ? 'bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
            >
              Pants
            </button>
          </div>

          {/* Studio Workspace Switcher: 2D Canvas vs Full-Page 3D Studio */}
          <div className="flex items-center bg-[#141822] p-0.5 rounded-lg border border-[#232936]">
            <button
              onClick={() => setViewMode('2d')}
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-mono font-semibold transition ${
                viewMode === '2d'
                  ? 'bg-[#00e5ff] text-black shadow-md font-bold'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>2D Canvas</span>
            </button>
            {is3DEnabled && (
              <button
                onClick={() => setViewMode('3d')}
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-mono font-semibold transition animate-in fade-in ${
                  viewMode === '3d'
                    ? 'bg-gradient-to-r from-[#7000ff] to-[#9333ea] text-white shadow-lg shadow-[#7000ff]/30 font-bold'
                    : 'text-[#94a3b8] hover:text-white'
                }`}
              >
                <Box className="w-3.5 h-3.5 text-[#00e5ff]" />
                <span>3D Studio</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    debugMode && !hasAttachment ? 'bg-[#fbbf24]' : 'bg-[#10b981]'
                  }`}
                />
              </button>
            )}
            {is3DEnabled && (
              <button
                onClick={() => setViewMode(viewMode === 'split' ? '3d' : 'split')}
                className={`hidden xl:flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-mono transition ${
                  viewMode === 'split'
                    ? 'bg-[#1e2536] text-[#00e5ff] border border-[#00e5ff]/40 font-bold'
                    : 'text-[#64748b] hover:text-white'
                }`}
                title="Split View: 2D Canvas & 3D Studio Side-by-Side"
              >
                <Columns className="w-3 h-3" />
                <span>Split</span>
              </button>
            )}
          </div>
        </div>

        {/* Center Primary Action: 1-Click Auto Strip Button */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 order-3 sm:order-2">
          <button
            onClick={handleAutoStrip}
            className="group relative flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-[#00e5ff] via-[#38bdf8] to-[#7000ff] hover:brightness-110 text-black font-extrabold text-[11px] sm:text-xs tracking-wider uppercase shadow-[0_0_20px_rgba(0,229,255,0.4)] transition-all active:scale-95"
            title="Wipe 100% of non-UV dead space pixels outside islands to rgba(0,0,0,0)"
          >
            <Zap className="w-3.5 h-3.5 text-black fill-black group-hover:scale-110 transition-transform" />
            <span>AUTO-STRIP</span>
            <span className="hidden sm:inline text-[10px] font-mono opacity-80 pl-0.5">(1-Click)</span>
          </button>

          {/* Quick Undo / Redo */}
          <div className="flex items-center space-x-0.5 bg-[#141822] p-0.5 rounded-lg border border-[#232936]">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded text-[#94a3b8] hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-[#1f2636] transition"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              className="p-1.5 rounded text-[#94a3b8] hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-[#1f2636] transition"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Tools: Ingestion, Samples, Copy UV Data, 3D Toggle, Export */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 order-2 sm:order-3">
          {/* Debug Mode Toggle (When turned ON, 3D model option and developer tools appear) */}
          <button
            onClick={() => {
              const next = !debugMode;
              setDebugMode(next);
              if (next) {
                setViewMode('3d');
              }
              triggerToast(
                next ? 'Debug Mode ON: 3D Model & Developer Tools Enabled' : 'Debug Mode OFF',
                'info'
              );
            }}
            className={`flex items-center space-x-1 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs font-mono transition ${
              debugMode
                ? 'bg-[#fbbf24]/20 border-[#fbbf24] text-[#fbbf24] font-bold shadow-sm'
                : 'bg-[#141822] border-[#232936] text-[#64748b] hover:text-[#94a3b8]'
            }`}
            title="Toggle Developer Debug Mode (Enables 3D Model without attachment & advanced tools)"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Debug</span>
          </button>

          {/* Debug Tools (Only shown when Debug Mode is ON) */}
          {debugMode && (
            <>
              <button
                onClick={handleCopyCoordinates}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-[#fbbf24]/15 hover:bg-[#fbbf24]/25 border border-[#fbbf24]/40 text-xs font-mono font-bold text-[#fbbf24] transition shadow-sm"
                title="Copy current wireframe line positions for debugging so you can paste into chat"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Copy UV Data</span>
              </button>

              <button
                onClick={() => setShowUvDebugModal(true)}
                className="flex items-center space-x-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#141822] hover:bg-[#1b2230] border border-[#232936] text-xs font-mono text-[#94a3b8] hover:text-white transition"
                title="Open UV Coordinates Inspector & Code Generator"
              >
                <Code2 className="w-3.5 h-3.5 text-[#00e5ff]" />
                <span className="hidden sm:inline">Debug Code</span>
              </button>
            </>
          )}

          {/* Sample Templates Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSampleDropdown(!showSampleDropdown)}
              className="flex items-center space-x-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#141822] hover:bg-[#1b2230] border border-[#232936] text-xs text-[#cbd5e1] font-medium transition"
              title="Load Pre-built Showcase Templates"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#00e5ff]" />
              <span className="hidden sm:inline">Samples</span>
              <ChevronDown className="w-3 h-3 text-[#64748b]" />
            </button>

            {showSampleDropdown && (
              <div className="absolute right-0 mt-2 w-72 bg-[#121622] border border-[#232936] rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-2 py-1 text-[10px] font-mono text-[#64748b] uppercase tracking-wider">
                  Test Scenarios (Pre-loaded)
                </div>
                {SAMPLE_TEMPLATES.map((sample) => (
                  <button
                    key={sample.id}
                    onClick={() => {
                      const canvas = sample.generate();
                      loadCanvasData(canvas, `${sample.name}.png`);
                      setShowSampleDropdown(false);
                      setConformBanner(null);
                      setViewMode('3d');
                      triggerToast(`Loaded "${sample.name}"`, 'info');
                    }}
                    className="w-full text-left p-2 rounded-lg hover:bg-[#1b2232] transition group flex flex-col space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white group-hover:text-[#00e5ff] transition">
                        {sample.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748b] leading-tight">
                      {sample.description}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Upload Custom File */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileUpload(file);
              }
              e.target.value = '';
            }}
            accept="image/*,.png,.jpg,.jpeg,.webp,.jfif,.bmp"
            className="hidden"
          />
          <button
            onClick={() => {
              addDebugLog('File picker opened.', 'info');
              fileInputRef.current?.click();
            }}
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 border border-[#00e5ff]/50 text-xs text-[#00e5ff] font-bold transition shadow-sm"
            title="Upload PNG, JPEG, or WebP"
          >
            <Upload className="w-3.5 h-3.5 text-[#00e5ff]" />
            <span>Upload</span>
          </button>

          {/* Desktop 3D Studio Quick Toggle */}
          {is3DEnabled && (
            <>
              <button
                onClick={() => setViewMode(viewMode === '3d' ? '2d' : '3d')}
                className={`hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border transition text-xs font-mono font-bold animate-in fade-in ${
                  viewMode === '3d'
                    ? 'bg-[#7000ff] border-[#7000ff] text-white shadow-lg shadow-[#7000ff]/30'
                    : 'bg-[#141822] border-[#232936] text-[#94a3b8] hover:text-white'
                }`}
                title="Toggle Full-Page 3D Avatar Studio"
              >
                <Box className="w-3.5 h-3.5 text-[#00e5ff]" />
                <span>3D Studio</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    debugMode && !hasAttachment ? 'bg-[#fbbf24]' : 'bg-[#10b981]'
                  }`}
                />
              </button>

              {hasAttachment && (
                <button
                  onClick={handleDetachAttachment}
                  className="hidden lg:flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-[#141822] hover:bg-[#ef4444]/20 border border-[#232936] hover:border-[#ef4444]/40 text-[#94a3b8] hover:text-[#f87171] text-xs font-mono transition"
                  title="Detach template image"
                >
                  <X className="w-3 h-3" />
                  <span>Detach</span>
                </button>
              )}
            </>
          )}

          {/* Export Gatekeeper Button */}
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#141822] hover:bg-[#1b2230] border border-[#232936] text-xs font-medium text-white transition"
            title="Verify 585x559 Dimension Lock and Download 32-bit PNG"
          >
            <Download className="w-3.5 h-3.5 text-[#10b981]" />
            <span className="font-semibold text-white">Export</span>
          </button>
        </div>
      </header>

      {/* --- NOTIFICATION TOAST --- */}
      {toastMessage && (
        <div
          className={`fixed top-14 right-4 z-50 flex items-center space-x-2 px-3.5 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl text-xs font-mono transition-all animate-in fade-in slide-in-from-top-3 ${
            toastMessage.type === 'success'
              ? 'bg-[#0f172a]/95 text-[#10b981] border-[#10b981]/40'
              : toastMessage.type === 'error'
              ? 'bg-[#1e1014]/95 text-[#ef4444] border-[#ef4444]/40 font-bold'
              : toastMessage.type === 'warning'
              ? 'bg-[#1e1610]/95 text-[#f59e0b] border-[#f59e0b]/40'
              : 'bg-[#0b1329]/95 text-[#00e5ff] border-[#00e5ff]/40'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0" />
          ) : toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-[#00e5ff] flex-shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-white/50 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* --- WORKSPACE VIEWPORTS --- */}
      <div className="relative flex-1 flex flex-col md:flex-row w-full h-[calc(100vh-105px)] overflow-hidden">
        {/* Drag & Drop Visual Target Overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 bg-[#00e5ff]/10 backdrop-blur-sm border-2 border-dashed border-[#00e5ff] flex flex-col items-center justify-center pointer-events-none animate-in fade-in">
            <Upload className="w-14 h-14 sm:w-16 sm:h-16 text-[#00e5ff] animate-bounce mb-3" />
            <div className="text-lg sm:text-xl font-bold font-mono text-white tracking-wider text-center px-4">
              DROP ROBLOX TEMPLATE HERE
            </div>
            <div className="text-xs font-mono text-[#94a3b8] mt-1 text-center px-4">
              Supports PNG, JPEG, WebP • Auto Pre-Flight 585 × 559 Validation
            </div>
          </div>
        )}

        {/* 2D Canvas Editor */}
        <div
          className={`h-full relative overflow-hidden transition-all ${
            viewMode === '3d'
              ? 'hidden'
              : viewMode === 'split'
              ? 'w-full md:w-1/2 flex flex-col border-r border-[#232936]'
              : 'w-full flex-1 flex flex-col'
          }`}
        >
          <CanvasViewport
            mainCanvasRef={mainCanvasRef}
            originalCanvasRef={originalCanvasRef}
            originalImageSourceRef={originalImageSourceRef}
            toolMode={toolMode}
            setToolMode={setToolMode}
            showWireframe={showWireframe}
            setShowWireframe={setShowWireframe}
            templateType={templateType}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            onCanvasModified={pushHistorySnapshot}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            debugMode={debugMode}
            onHoverCoordChange={setHoverInfo}
            onUploadClick={() => fileInputRef.current?.click()}
            conformBannerInfo={
              conformBanner
                ? {
                    ...conformBanner,
                    onSwitchMode: handleSwitchConformMode,
                    onDismiss: () => setConformBanner(null)
                  }
                : null
            }
            islands={activeIslands}
            onUpdateIslands={handleUpdateIslands}
            onResetIslands={handleResetIslands}
            onOpenDebugModal={() => setShowUvDebugModal(true)}
            onCopyCoordinates={handleCopyCoordinates}
          />
        </div>

        {/* 3D Roblox Avatar Studio (Full Page or Split View) */}
        {is3DEnabled && (viewMode === '3d' || viewMode === 'split') && (
          <div
            className={`h-full flex flex-col bg-[#0a0c10] shadow-2xl relative z-10 transition-all ${
              viewMode === '3d'
                ? 'w-full flex-1'
                : 'w-full md:w-1/2 border-l border-[#232936]'
            }`}
          >
            <Roblox3DViewport
              sourceCanvas={mainCanvasRef.current}
              templateType={templateType}
              updateTrigger={updateTrigger}
              islands={activeIslands}
              onToggleTemplateType={() => setTemplateType((t) => (t === 'shirt' ? 'pants' : 'shirt'))}
              onReturnTo2D={() => setViewMode('2d')}
              isFullPage={viewMode === '3d'}
            />
          </div>
        )}
      </div>

      {/* --- REAL-TIME DEBUG CONSOLE & HEALTH STRIP (Only visible when debugMode is ON) --- */}
      {debugMode && (
        <DebugConsole
          logs={debugLogs}
          onClearLogs={() => setDebugLogs([])}
          onRunDiagnostics={handleRunDiagnostics}
          canvasHealth={{
            isMainMounted: !!mainCanvasRef.current,
            canvasWidth: mainCanvasRef.current?.width || 0,
            canvasHeight: mainCanvasRef.current?.height || 0,
            dirtyPixels: preflightReport?.dirtyNonUvPixels || 0,
            uvConformity: preflightReport?.uvConformityPercentage || 100,
            totalHistorySteps: historyStackRef.current.length
          }}
        />
      )}

      {/* --- STATUS BAR & HUD --- */}
      <footer className="flex flex-wrap items-center justify-between px-3 sm:px-4 py-1.5 bg-[#0b0e14] border-t border-[#232936] text-[10px] sm:text-[11px] font-mono text-[#64748b] z-20 gap-1.5">
        {/* Left: Pixel inspector / Current UV island */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {hoverInfo ? (
            <div className="flex items-center space-x-1.5 sm:space-x-2 text-[#94a3b8]">
              <span className="text-white font-bold">
                {hoverInfo.x}, {hoverInfo.y}
              </span>
              {hoverInfo.island ? (
                <span className="px-1.5 py-0.2 rounded bg-[#00e5ff]/15 text-[#00e5ff] font-bold border border-[#00e5ff]/30 text-[10px]">
                  {hoverInfo.island.name}
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded bg-[#ef4444]/15 text-[#ef4444] font-semibold border border-[#ef4444]/30 text-[10px]">
                  DEAD SPACE
                </span>
              )}
              {hoverInfo.colorRgba && (
                <span className="text-[#64748b] text-[9px] hidden sm:inline">
                  {hoverInfo.colorRgba}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="text-[#475569] hidden sm:inline">Hover over template to inspect UV coordinates</span>
              <span className="text-[#475569] sm:hidden">585×559 Spec</span>
            </div>
          )}
        </div>

        {/* Center: Template Purity Gauge */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {isDirtyBackground ? (
            <button
              onClick={handleAutoStrip}
              className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/30 hover:bg-[#ef4444]/25 transition font-bold"
              title="Click to wipe all dirty non-UV pixels now"
            >
              <AlertCircle className="w-3 h-3 text-[#ef4444]" />
              <span>
                {preflightReport?.dirtyNonUvPixels.toLocaleString()} DIRTY PX
              </span>
            </button>
          ) : (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 font-bold">
              <CheckCircle2 className="w-3 h-3 text-[#10b981]" />
              <span>100% PURE (CLEAN)</span>
            </div>
          )}
        </div>

        {/* Right: Dimension Lock Spec & Quick Copy Trigger */}
        <div className="hidden sm:flex items-center space-x-2 text-[#00e5ff] font-bold">
          {debugMode && (
            <>
              <button
                onClick={() => setShowUvDebugModal(true)}
                className="text-[10px] text-[#fbbf24] hover:underline flex items-center space-x-1 font-mono font-normal"
              >
                <span>Coordinates Debugger</span>
              </button>
              <span className="text-[#334155]">|</span>
            </>
          )}
          <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
          <span>585 × 559 px</span>
        </div>
      </footer>

      {/* --- PRE-FLIGHT CHECK MODAL --- */}
      <PreflightModal
        isOpen={showPreflightModal}
        uploadedWidth={pendingUploadFile?.width || 0}
        uploadedHeight={pendingUploadFile?.height || 0}
        fileName={pendingUploadFile?.name || ''}
        onApplyResample={handleApplyResampleFromModal}
        onCancel={() => setShowPreflightModal(false)}
      />

      {/* --- STRICT EXPORT GATEKEEPER MODAL --- */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        canvas={mainCanvasRef.current}
        onQuickStrip={handleAutoStrip}
        islands={activeIslands}
      />

      {/* --- UV LINE CALIBRATION & COORDINATES DEBUG MODAL --- */}
      <UvDebugModal
        isOpen={showUvDebugModal}
        onClose={() => setShowUvDebugModal(false)}
        islands={activeIslands}
        templateType={templateType}
        onUpdateIslands={handleUpdateIslands}
        onResetToDefault={handleResetIslands}
      />
    </div>
  );
}
