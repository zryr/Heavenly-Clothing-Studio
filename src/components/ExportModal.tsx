import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  Package,
  Palette,
  Sparkles,
  X
} from 'lucide-react';
import { PreflightReport, TemplateType, UvIsland, getTemplateSpec } from '../types/uv';
import { CustomBackgroundConfig } from '../types/studio';
import { buildExportFilename, exportVerifiedPng } from '../utils/uvEngine';
import { composeExportCanvasWithBackground } from '../utils/backgroundCompositor';
import { buildZipBlob } from '../utils/zipBuilder';

export interface OutfitZipSlotEntry {
  type: TemplateType;
  canvas: HTMLCanvasElement;
  islands: UvIsland[];
  bleedMargin: number;
  preflight: PreflightReport;
  name: string;
  customBackground: CustomBackgroundConfig;
  customBgImage: HTMLImageElement | null;
}

interface ExportModalProps {
  canvas: HTMLCanvasElement;
  templateType: TemplateType;
  islands: UvIsland[];
  bleedMargin: number;
  preflight: PreflightReport;
  defaultFileName: string;
  customBackground: CustomBackgroundConfig;
  customBgImage: HTMLImageElement | null;
  outfitSlotsForZip?: OutfitZipSlotEntry[];
  onUpdateCustomBackground: (patch: Partial<CustomBackgroundConfig>) => void;
  onAutoCleanSync: () => PreflightReport | null;
  onCleanAllSlotsSync?: () => OutfitZipSlotEntry[];
  onClose: () => void;
  onExportSuccess: (filename: string) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  canvas,
  templateType,
  islands,
  bleedMargin,
  preflight: initialPreflight,
  defaultFileName,
  customBackground,
  customBgImage,
  outfitSlotsForZip = [],
  onUpdateCustomBackground,
  onAutoCleanSync,
  onCleanAllSlotsSync,
  onClose,
  onExportSuccess
}) => {
  const spec = getTemplateSpec(templateType);
  const [report, setReport] = useState<PreflightReport>(initialPreflight);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [fileName, setFileName] = useState<string>(
    buildExportFilename(defaultFileName, templateType).replace(/\.png$/i, '')
  );
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const getComposedExportCanvas = () =>
    composeExportCanvasWithBackground(
      canvas,
      templateType,
      islands,
      customBackground,
      customBgImage,
      bleedMargin
    );

  const refreshPreview = () => {
    try {
      const target = getComposedExportCanvas();
      setPreviewUrl(target.toDataURL('image/png'));
    } catch {
      setPreviewUrl('');
    }
  };

  useEffect(() => {
    setReport(initialPreflight);
    refreshPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPreflight, canvas, customBackground, customBgImage, bleedMargin]);

  const handleCleanNow = () => {
    const updated = onAutoCleanSync();
    if (updated) {
      setReport(updated);
    }
    refreshPreview();
    setStatusMessage({
      type: 'success',
      text: 'Stripped pixels outside UV islands and refreshed export preview.'
    });
  };

  const handleDownload = async (cleanFirst: boolean) => {
    setBusy(true);
    setStatusMessage(null);
    try {
      if (cleanFirst && spec.hasUvIslands) {
        const updated = onAutoCleanSync();
        if (updated) setReport(updated);
        refreshPreview();
      }
      const composed = getComposedExportCanvas();
      const result = await exportVerifiedPng(composed, templateType, fileName);
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onExportSuccess(result.filename);
      setStatusMessage({
        type: 'success',
        text: `Downloaded ${result.filename} (${result.width} × ${result.height} px PNG-32).`
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to export PNG.'
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCopyClipboard = async () => {
    setStatusMessage(null);
    try {
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
        throw new Error('Image clipboard copy is not supported in this browser.');
      }
      const composed = getComposedExportCanvas();
      const result = await exportVerifiedPng(composed, templateType, fileName);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': result.blob })]);
      setStatusMessage({
        type: 'success',
        text: 'Copied lossless PNG to clipboard.'
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not copy PNG to clipboard.'
      });
    }
  };

  const handleDownloadOutfitZip = async (cleanAllFirst: boolean = false) => {
    if (outfitSlotsForZip.length === 0) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const slotsToPack =
        cleanAllFirst && onCleanAllSlotsSync ? onCleanAllSlotsSync() : outfitSlotsForZip;
      if (cleanAllFirst) {
        const activeEntry = slotsToPack.find((s) => s.type === templateType);
        if (activeEntry) setReport(activeEntry.preflight);
        refreshPreview();
      }
      const files: { name: string; data: Uint8Array }[] = [];
      const checklistLines: string[] = [
        'HEAVENLY CLOTHING STUDIO — ROBLOX UPLOAD PACK',
        `Generated: ${new Date().toLocaleString()}`,
        '',
        'Included Verified Garments:'
      ];

      for (const slot of slotsToPack) {
        const composed = composeExportCanvasWithBackground(
          slot.canvas,
          slot.type,
          slot.islands,
          slot.customBackground,
          slot.customBgImage,
          slot.bleedMargin
        );
        const res = await exportVerifiedPng(composed, slot.type, slot.name);
        const bytes = new Uint8Array(await res.blob.arrayBuffer());
        files.push({ name: res.filename, data: bytes });
        const slotSpec = getTemplateSpec(slot.type);
        const cleanNote = slotSpec.hasUvIslands
          ? slot.preflight.dirtyNonUvPixels === 0
            ? 'Clean UV (0 outside px)'
            : `${slot.preflight.dirtyNonUvPixels} outside px`
          : 'Chest graphic ready';
        checklistLines.push(
          `- ${slotSpec.label}: ${res.filename} (${res.width}x${res.height} PNG-32 · ${cleanNote})`
        );
      }

      checklistLines.push(
        '',
        'Roblox Creator Hub Upload Steps:',
        '1. Open create.roblox.com → Creations → Avatar Items → Classics.',
        '2. Upload each PNG to its matching category (Classic Shirts / Classic Pants / Classic T-Shirts).',
        '3. Preview on R15 & Woman rigs before publishing.'
      );

      files.push({
        name: 'UPLOAD_CHECKLIST.txt',
        data: new TextEncoder().encode(checklistLines.join('\n'))
      });

      const zipBlob = buildZipBlob(files);
      const baseSlug = (fileName.trim() || 'Heavenly_Outfit').replace(/[^a-zA-Z0-9_-]/g, '_');
      const zipName = `${baseSlug}_RobloxPack.zip`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      onExportSuccess(zipName);
      setStatusMessage({
        type: 'success',
        text: cleanAllFirst
          ? `Cleaned all slots & downloaded ${zipName} (${slotsToPack.length} garments + checklist).`
          : `Downloaded ${zipName} (${slotsToPack.length} garments + upload checklist).`
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to build Outfit ZIP Pack.'
      });
    } finally {
      setBusy(false);
    }
  };

  const hasDirtyOutside = spec.hasUvIslands && report.dirtyNonUvPixels > 0;
  const dirtyZipSlots = outfitSlotsForZip.filter(
    (s) => getTemplateSpec(s.type).hasUvIslands && s.preflight.dirtyNonUvPixels > 0
  ).length;
  const isEmpty = report.visiblePixels === 0;
  const allChecksGreen = report.isExactDimensions && !hasDirtyOutside && !isEmpty;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-h-surface border border-h-border rounded-3xl shadow-[0_24px_64px_rgba(15,23,42,0.18)] overflow-hidden flex flex-col max-h-[92vh] text-h-text"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-h-border-soft bg-h-surface-2 flex items-center justify-between">
          <div>
            <h2 id="export-modal-title" className="font-display text-lg font-bold text-h-text">
              Export {spec.label}
            </h2>
            <p className="text-xs text-h-muted">{spec.requirementSummary}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-h-muted hover:text-h-text hover:bg-h-surface-3 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Live Export Preview */}
          <div className="space-y-2.5">
            <div className="aspect-square rounded-2xl checkerboard-surface border border-h-border overflow-hidden flex items-center justify-center p-3">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Verified export preview"
                  className="max-w-full max-h-full object-contain [image-rendering:pixelated]"
                />
              )}
            </div>
            <p className="text-[11px] text-h-muted leading-relaxed">
              This preview reflects the exact lossless PNG-32 bitmap that will be downloaded.
            </p>
          </div>

          {/* Dynamic Checks & Filename */}
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-h-text-2 uppercase tracking-wider">
                Preflight Verification
              </h3>

              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-h-surface-2 border border-h-border-soft text-xs">
                <span className="text-h-text-2">Dimensions</span>
                <span
                  className={`font-mono font-semibold flex items-center gap-1.5 ${
                    report.isExactDimensions ? 'text-emerald-600' : 'text-rose-400'
                  }`}
                >
                  {report.isExactDimensions ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  {report.width} × {report.height} px
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-h-surface-2 border border-h-border-soft text-xs">
                <span className="text-h-text-2">Visible Pixels</span>
                <span
                  className={`font-mono font-semibold flex items-center gap-1.5 ${
                    isEmpty ? 'text-amber-600' : 'text-h-text'
                  }`}
                >
                  {report.visiblePixels.toLocaleString()}
                </span>
              </div>

              {spec.hasUvIslands && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-h-surface-2 border border-h-border-soft text-xs">
                  <span className="text-h-text-2">Outside UV Islands</span>
                  <span
                    data-testid="export-outside-status"
                    className={`font-mono font-semibold flex items-center gap-1.5 ${
                      hasDirtyOutside ? 'text-amber-600' : 'text-emerald-600'
                    }`}
                  >
                    {hasDirtyOutside ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {report.dirtyNonUvPixels.toLocaleString()} px
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        0 px (Clean)
                      </>
                    )}
                  </span>
                </div>
              )}

              {/* Custom Stripped Background Export Toggle */}
              {customBackground.mode !== 'transparent' && (
                <label className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-h-surface-3 border border-[#BFDBFE] text-xs cursor-pointer">
                  <span className="flex items-center gap-1.5 font-semibold text-h-accent-text">
                    <Palette className="w-3.5 h-3.5" />
                    Bake Custom Backdrop
                  </span>
                  <input
                    type="checkbox"
                    checked={customBackground.includeInExport}
                    onChange={(e) =>
                      onUpdateCustomBackground({ includeInExport: e.target.checked })
                    }
                    data-testid="export-modal-bg-toggle"
                    className="accent-h-accent w-4 h-4 cursor-pointer"
                  />
                </label>
              )}
            </div>

            {hasDirtyOutside && (
              <button
                type="button"
                onClick={handleCleanNow}
                data-testid="export-clean-now-btn"
                className="w-full py-2 px-3 rounded-xl bg-amber-500/12 hover:bg-amber-500/20 border border-amber-300 text-amber-500 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Strip Outside Pixels & Refresh Preview
              </button>
            )}

            {/* Editable Filename */}
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-h-text-2">Export Filename</span>
              <div className="flex items-center rounded-xl bg-h-surface-2 border border-h-border focus-within:border-h-accent overflow-hidden">
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder={`Heavenly_${spec.shortLabel}`}
                  className="flex-1 h-9 px-3 bg-transparent text-xs font-mono text-h-text focus:outline-none"
                />
                <span className="px-2.5 text-xs font-mono text-h-muted border-l border-h-border">
                  .png
                </span>
              </div>
            </label>

            {statusMessage && (
              <div
                className={`p-3 rounded-xl border text-xs font-medium ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/12 border-emerald-400/35 text-emerald-400'
                    : 'bg-rose-500/12 border-rose-400/35 text-rose-400'
                }`}
              >
                {statusMessage.text}
              </div>
            )}

            <div className="text-[11px] text-h-muted">
              Status:{' '}
              <span
                className={
                  allChecksGreen
                    ? 'text-emerald-600 font-semibold'
                    : 'text-amber-600 font-semibold'
                }
              >
                {allChecksGreen
                  ? customBackground.mode !== 'transparent' && customBackground.includeInExport
                    ? 'Ready with custom presentation backdrop'
                    : 'Ready for Roblox Creator Hub upload'
                  : isEmpty
                  ? 'Canvas is currently transparent'
                  : 'Review highlighted items above before uploading'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-h-border-soft bg-h-surface-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyClipboard}
              disabled={busy || !report.isExactDimensions}
              className="px-3 py-2 rounded-xl bg-h-surface hover:bg-h-surface-3 border border-h-border text-xs font-semibold text-h-text-2 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
            >
              <ClipboardCopy className="w-3.5 h-3.5" />
              Copy PNG
            </button>

            {outfitSlotsForZip.length >= 1 && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => handleDownloadOutfitZip(dirtyZipSlots > 0 && Boolean(onCleanAllSlotsSync))}
                disabled={busy}
                data-testid="export-zip-pack-btn"
                title={
                  dirtyZipSlots > 0 && onCleanAllSlotsSync
                    ? `Auto-clean ${dirtyZipSlots} dirty slot(s) and bundle all ${outfitSlotsForZip.length} garments + checklist into one .zip`
                    : `Bundle ${outfitSlotsForZip.length} loaded garment(s) + Roblox upload checklist into one .zip`
                }
                className="px-3 py-2 rounded-xl bg-h-accent-soft hover:bg-h-accent hover:text-white border border-h-accent-border text-xs font-semibold text-h-accent-text flex items-center gap-1.5 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Package className="w-3.5 h-3.5" />
                {dirtyZipSlots > 0 && onCleanAllSlotsSync
                  ? `Clean & ZIP (${outfitSlotsForZip.length})`
                  : `ZIP Pack (${outfitSlotsForZip.length})`}
              </motion.button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {hasDirtyOutside && (
              <button
                type="button"
                disabled={busy || !report.isExactDimensions}
                onClick={() => handleDownload(true)}
                className="px-3.5 py-2 rounded-xl bg-h-surface-3 hover:bg-h-accent-soft border border-[#93C5FD] text-h-accent-text text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Clean & Download
              </button>
            )}
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              disabled={busy || !report.isExactDimensions}
              onClick={() => handleDownload(false)}
              data-testid="export-download-btn"
              className="px-4 py-2 rounded-xl bg-h-accent hover:bg-h-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer shadow-xs whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Download PNG-32
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
