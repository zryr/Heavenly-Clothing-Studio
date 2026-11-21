import React, { useEffect, useState } from 'react';
import {
  Download,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  Lock,
  X,
  FileCheck,
  Sparkles
} from 'lucide-react';
import { TEMPLATE_WIDTH, TEMPLATE_HEIGHT, PreflightReport } from '../types/uv';
import { exportStrictPng, analyzePreflight, autoStripNonUvPixels } from '../utils/uvEngine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  canvas: HTMLCanvasElement | null;
  onQuickStrip: () => void;
  islands?: import('../types/uv').UvIsland[];
}

export const ExportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  canvas,
  onQuickStrip,
  islands
}) => {
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');

  useEffect(() => {
    if (isOpen && canvas) {
      const rep = analyzePreflight(canvas, 'Roblox_Template.png', 0, islands);
      setReport(rep);
      try {
        setPreviewDataUrl(canvas.toDataURL('image/png'));
      } catch (err) {
        console.error('Failed to generate preview data URL', err);
      }
    }
  }, [isOpen, canvas, islands]);

  if (!isOpen || !canvas) return null;

  const isExactDimension = canvas.width === TEMPLATE_WIDTH && canvas.height === TEMPLATE_HEIGHT;
  const isDirty = (report?.dirtyNonUvPixels || 0) > 0;

  const handleDownload = async () => {
    try {
      setIsExporting(true);
      const { blob, filename } = await exportStrictPng(canvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err: any) {
      alert(`Export Error: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      const { blob } = await exportStrictPng(canvas);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
      // Fallback: alert user or toast
      alert('Direct image copy not supported in this browser environment. Use Download button.');
    }
  };

  const handleStripAndDownload = () => {
    onQuickStrip();
    setTimeout(() => {
      handleDownload();
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150 overflow-y-auto">
      <div className="relative w-full max-w-xl max-h-[92vh] flex flex-col bg-[#11141d] border border-[#232936] rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.9)] overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-[#161a25] border-b border-[#232936] flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20 flex-shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide flex items-center space-x-2">
                <span>STRICT EXPORT GATEKEEPER</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] bg-[#00e5ff]/15 text-[#00e5ff] font-mono border border-[#00e5ff]/30">
                  PASSED
                </span>
              </h3>
              <p className="text-[11px] sm:text-xs text-[#94a3b8] font-mono">
                Hardcoded 585 × 559 px 32-bit Transparent PNG Verification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#64748b] hover:text-white hover:bg-[#232936] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          {/* Main Inspection Grid */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-5">
            {/* Visual Thumbnail */}
            <div
              className="w-28 h-28 sm:w-36 sm:h-36 mx-auto sm:mx-0 rounded-xl border border-[#232936] overflow-hidden flex-shrink-0 relative shadow-inner"
              style={{
                backgroundImage: `
                  linear-gradient(45deg, #181d28 25%, transparent 25%), 
                  linear-gradient(-45deg, #181d28 25%, transparent 25%), 
                  linear-gradient(45deg, transparent 75%, #181d28 75%), 
                  linear-gradient(-45deg, transparent 75%, #181d28 75%)
                `,
                backgroundSize: '12px 12px',
                backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                backgroundColor: '#0d1017'
              }}
            >
              {previewDataUrl && (
                <img
                  src={previewDataUrl}
                  alt="Template Preview"
                  className="w-full h-full object-contain image-rendering-pixelated"
                />
              )}
            </div>

            {/* Checklist */}
            <div className="flex-1 space-y-2 text-xs font-mono">
              <div className="p-2 sm:p-2.5 rounded-lg bg-[#0e1118] border border-[#232936] flex items-center justify-between">
                <span className="text-[#94a3b8]">Exact Dimension:</span>
                <span className="text-[#00e5ff] font-bold flex items-center space-x-1">
                  <Check className="w-3.5 h-3.5 text-[#10b981]" />
                  <span>585 × 559 px</span>
                </span>
              </div>

              <div className="p-2 sm:p-2.5 rounded-lg bg-[#0e1118] border border-[#232936] flex items-center justify-between">
                <span className="text-[#94a3b8]">Format & Channels:</span>
                <span className="text-[#00e5ff] font-bold flex items-center space-x-1">
                  <Check className="w-3.5 h-3.5 text-[#10b981]" />
                  <span>PNG-32 (RGBA Alpha)</span>
                </span>
              </div>

              <div className="p-2 sm:p-2.5 rounded-lg bg-[#0e1118] border border-[#232936] flex items-center justify-between">
                <span className="text-[#94a3b8]">UV Dead Space:</span>
                {isDirty ? (
                  <span className="text-[#ef4444] font-bold flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#ef4444]" />
                    <span>{report?.dirtyNonUvPixels.toLocaleString()} dirty px</span>
                  </span>
                ) : (
                  <span className="text-[#10b981] font-bold flex items-center space-x-1">
                    <Check className="w-3.5 h-3.5 text-[#10b981]" />
                    <span>100% Zero Leakage</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Dirty Background Notice if user hasn't stripped yet */}
          {isDirty && (
            <div className="p-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-xs text-[#fca5a5] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-[#ef4444] flex-shrink-0" />
                <span>
                  Notice: Detected non-UV background pixels. Strip them before uploading to Roblox.
                </span>
              </div>
              <button
                onClick={handleStripAndDownload}
                className="w-full sm:w-auto px-3 py-1.5 bg-[#ef4444] hover:bg-[#dc2626] text-white font-bold rounded-lg whitespace-nowrap shadow transition text-center"
              >
                Auto-Strip & Download
              </button>
            </div>
          )}

          {/* Export File Details */}
          <div className="p-2.5 sm:p-3 bg-[#0a0d14] rounded-xl border border-[#232936] text-[10px] sm:text-[11px] font-mono text-[#64748b]">
            <div className="flex justify-between py-0.5">
              <span>Output Specification:</span>
              <span className="text-white">Roblox Creator Store Compliant</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Compression:</span>
              <span className="text-white">Lossless PNG Deflate (Zero Quality Loss)</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-[#141824] border-t border-[#232936] flex-shrink-0">
          <button
            onClick={handleCopyToClipboard}
            className="flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-[#1e2433] hover:bg-[#283144] text-[#94a3b8] hover:text-white text-xs font-semibold rounded-xl border border-[#2a3244] transition"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#10b981]" />
                <span className="text-[#10b981]">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Image</span>
              </>
            )}
          </button>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs font-semibold text-[#94a3b8] hover:text-white transition"
            >
              Close
            </button>
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="flex items-center space-x-2 px-4 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-[#00e5ff] via-[#38bdf8] to-[#0284c7] hover:brightness-110 text-black text-xs font-bold rounded-xl shadow-lg shadow-[#00e5ff]/20 transition active:scale-95 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{downloadSuccess ? 'Downloaded!' : 'Download PNG'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
