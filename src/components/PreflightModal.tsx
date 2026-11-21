import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, ArrowRight, ShieldCheck, RefreshCw, X } from 'lucide-react';
import { TEMPLATE_WIDTH, TEMPLATE_HEIGHT } from '../types/uv';

interface Props {
  isOpen: boolean;
  uploadedWidth: number;
  uploadedHeight: number;
  fileName: string;
  onApplyResample: (mode: 'scale' | 'pad' | 'crop') => void;
  onCancel: () => void;
}

export const PreflightModal: React.FC<Props> = ({
  isOpen,
  uploadedWidth,
  uploadedHeight,
  fileName,
  onApplyResample,
  onCancel
}) => {
  const [selectedMode, setSelectedMode] = useState<'scale' | 'pad' | 'crop'>('scale');

  if (!isOpen) return null;

  const isExact = uploadedWidth === TEMPLATE_WIDTH && uploadedHeight === TEMPLATE_HEIGHT;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col bg-[#11141c] border border-[#ef4444]/40 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.15)] overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-[#161a24] border-b border-[#232936] flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                PRE-FLIGHT RESOLUTION ALERT
              </h3>
              <p className="text-[11px] sm:text-xs text-[#94a3b8] font-mono">
                Roblox Classic templates require strictly 585 × 559 px
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-[#64748b] hover:text-white hover:bg-[#232936] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          {/* Comparison Cards */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs font-mono">
            <div className="p-2.5 sm:p-3 rounded-xl bg-[#0c0e14] border border-[#ef4444]/30">
              <span className="text-[#94a3b8] text-[10px] uppercase block mb-0.5">Uploaded Asset</span>
              <div className="text-base sm:text-lg font-bold text-[#ef4444]">
                {uploadedWidth} × {uploadedHeight} <span className="text-[10px]">px</span>
              </div>
              <span className="text-[10px] text-[#ef4444]/80 mt-0.5 block truncate" title={fileName}>
                {fileName}
              </span>
            </div>

            <div className="p-2.5 sm:p-3 rounded-xl bg-[#0c0e14] border border-[#00e5ff]/30">
              <span className="text-[#94a3b8] text-[10px] uppercase block mb-0.5">Target Engine Spec</span>
              <div className="text-base sm:text-lg font-bold text-[#00e5ff]">
                585 × 559 <span className="text-[10px]">px</span>
              </div>
              <span className="text-[10px] text-[#00e5ff]/80 mt-0.5 block">
                Roblox Classic Spec
              </span>
            </div>
          </div>

          <p className="text-[11px] sm:text-xs text-[#94a3b8] leading-relaxed">
            Uploading an incorrect aspect ratio causes avatar texture tearing and upload rejection on Roblox Creator Hub. Select a conform engine option:
          </p>

          {/* Radio Options */}
          <div className="space-y-2">
            <label
              onClick={() => setSelectedMode('scale')}
              className={`flex items-start p-2.5 sm:p-3 rounded-xl border cursor-pointer transition ${
                selectedMode === 'scale'
                  ? 'bg-[#00e5ff]/10 border-[#00e5ff] text-white'
                  : 'bg-[#151922] border-[#232936] text-[#94a3b8] hover:border-[#384252]'
              }`}
            >
              <input
                type="radio"
                name="resample"
                checked={selectedMode === 'scale'}
                onChange={() => setSelectedMode('scale')}
                className="mt-1 mr-2.5 sm:mr-3 accent-[#00e5ff]"
              />
              <div>
                <div className="font-semibold text-xs flex flex-wrap items-center gap-1.5">
                  <span className="text-white">Auto-Resample to 585 × 559 (Bicubic High-Q)</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#00e5ff]/20 text-[#00e5ff] font-mono">
                    RECOMMENDED
                  </span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-[#64748b] mt-0.5">
                  Scales the template smoothly to exact 585x559 dimensions with high-fidelity interpolation.
                </div>
              </div>
            </label>

            <label
              onClick={() => setSelectedMode('pad')}
              className={`flex items-start p-2.5 sm:p-3 rounded-xl border cursor-pointer transition ${
                selectedMode === 'pad'
                  ? 'bg-[#00e5ff]/10 border-[#00e5ff] text-white'
                  : 'bg-[#151922] border-[#232936] text-[#94a3b8] hover:border-[#384252]'
              }`}
            >
              <input
                type="radio"
                name="resample"
                checked={selectedMode === 'pad'}
                onChange={() => setSelectedMode('pad')}
                className="mt-1 mr-2.5 sm:mr-3 accent-[#00e5ff]"
              />
              <div>
                <div className="font-semibold text-xs text-white">Pad / Center on 585 × 559 Transparent Canvas</div>
                <div className="text-[10px] sm:text-[11px] text-[#64748b] mt-0.5">
                  Preserves strict pixel aspect ratio and centers the graphic onto transparent 585x559 canvas boundaries without stretching.
                </div>
              </div>
            </label>

            <label
              onClick={() => setSelectedMode('crop')}
              className={`flex items-start p-2.5 sm:p-3 rounded-xl border cursor-pointer transition ${
                selectedMode === 'crop'
                  ? 'bg-[#00e5ff]/10 border-[#00e5ff] text-white'
                  : 'bg-[#151922] border-[#232936] text-[#94a3b8] hover:border-[#384252]'
              }`}
            >
              <input
                type="radio"
                name="resample"
                checked={selectedMode === 'crop'}
                onChange={() => setSelectedMode('crop')}
                className="mt-1 mr-2.5 sm:mr-3 accent-[#00e5ff]"
              />
              <div>
                <div className="font-semibold text-xs text-white">Center Crop to 585 × 559</div>
                <div className="text-[10px] sm:text-[11px] text-[#64748b] mt-0.5">
                  Crops excess border pixels from outer edges while retaining center coordinates.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-[#141822] border-t border-[#232936] flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-3 py-2 text-xs font-semibold text-[#94a3b8] hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onApplyResample(selectedMode)}
            className="flex items-center space-x-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-[#00e5ff] to-[#00b4d8] hover:from-[#00cce6] hover:to-[#0096c7] text-black text-xs font-bold rounded-xl shadow-lg transition active:scale-95"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Apply Conform</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
