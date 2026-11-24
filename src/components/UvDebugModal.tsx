import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, Download, RotateCcw, Upload, X } from 'lucide-react';
import {
  ROBLOX_PANTS_UV_ISLANDS,
  ROBLOX_SHIRT_UV_ISLANDS,
  UvIsland
} from '../types/uv';
import { validateUvIslands } from '../utils/uvEngine';

interface UvDebugModalProps {
  templateType: 'shirt' | 'pants';
  islands: UvIsland[];
  onApplyIslands: (islands: UvIsland[]) => void;
  onResetDefaults: () => void;
  onClose: () => void;
}

export const UvDebugModal: React.FC<UvDebugModalProps> = ({
  templateType,
  islands,
  onApplyIslands,
  onResetDefaults,
  onClose
}) => {
  const defaults = templateType === 'pants' ? ROBLOX_PANTS_UV_ISLANDS : ROBLOX_SHIRT_UV_ISLANDS;
  const [jsonDraft, setJsonDraft] = useState<string>(() => JSON.stringify(islands, null, 2));
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const deltaRows = useMemo(() => {
    const defaultByName = new Map(defaults.map((d) => [d.name, d]));
    return islands.map((isl) => {
      const def = defaultByName.get(isl.name);
      const changed =
        !def || def.x !== isl.x || def.y !== isl.y || def.w !== isl.w || def.h !== isl.h;
      return { island: isl, def, changed };
    });
  }, [islands, defaults]);

  const modifiedCount = deltaRows.filter((r) => r.changed).length;

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(islands, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setStatus({ type: 'error', text: 'Clipboard copy failed in this browser context.' });
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(islands, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Heavenly_UV_${templateType}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleApplyJson = () => {
    setStatus(null);
    try {
      const parsed = JSON.parse(jsonDraft);
      const validated = validateUvIslands(parsed);
      if (!validated) {
        throw new Error(
          'JSON must be a non-empty array of UV island objects with valid x, y, w, h values.'
        );
      }
      onApplyIslands(validated);
      setStatus({ type: 'success', text: `Applied ${validated.length} validated UV islands.` });
    } catch (err) {
      setStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Invalid UV JSON.'
      });
    }
  };

  const handleReset = () => {
    onResetDefaults();
    setJsonDraft(JSON.stringify(defaults, null, 2));
    setStatus({ type: 'success', text: 'Restored official Roblox UV coordinates.' });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="uv-json-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-4xl bg-h-surface border border-h-border rounded-3xl shadow-[0_24px_64px_rgba(15,23,42,0.18)] overflow-hidden flex flex-col max-h-[88vh] text-h-text"
      >
        <div className="px-5 py-4 border-b border-h-border-soft bg-h-surface-2 flex items-center justify-between">
          <div>
            <h2 id="uv-json-title" className="font-display text-lg font-bold text-h-text">
              UV Coordinates Inspector ({templateType === 'shirt' ? 'Classic Shirt' : 'Classic Pants'})
            </h2>
            <p className="text-xs text-h-muted">
              {modifiedCount === 0
                ? 'Matches official Roblox 585 × 559 reference coordinates.'
                : `${modifiedCount} island${modifiedCount === 1 ? '' : 's'} customized relative to official Roblox defaults.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-h-muted hover:text-h-text hover:bg-h-surface-3 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-h-text-2 uppercase tracking-wider">
              Island Rectangles (px)
            </h3>
            <div className="rounded-2xl border border-h-border overflow-hidden max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-[11px] font-mono">
                <thead className="bg-h-surface-2 text-h-muted sticky top-0 border-b border-h-border-soft">
                  <tr>
                    <th className="px-2.5 py-2 font-semibold">Island</th>
                    <th className="px-2 py-2 font-semibold text-right">X, Y</th>
                    <th className="px-2 py-2 font-semibold text-right">W × H</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2ECF9]">
                  {deltaRows.map(({ island, changed }) => (
                    <tr key={island.name} className={changed ? 'bg-amber-500/12' : 'bg-h-surface'}>
                      <td className="px-2.5 py-1.5 text-h-text font-sans text-xs font-medium">
                        {island.name}
                        {changed && (
                          <span className="ml-1.5 text-[10px] text-amber-400 font-mono">mod</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-h-text-2 tabular-nums">
                        {island.x}, {island.y}
                      </td>
                      <td className="px-2 py-1.5 text-right text-h-muted tabular-nums">
                        {island.w} × {island.h}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-h-text-2 uppercase tracking-wider">
                Portable UV Preset JSON
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="px-2.5 py-1 rounded-lg bg-h-surface-2 hover:bg-h-surface-3 border border-h-border text-[11px] font-medium text-h-text-2 flex items-center gap-1 cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="px-2.5 py-1 rounded-lg bg-h-surface-2 hover:bg-h-surface-3 border border-h-border text-[11px] font-medium text-h-text-2 flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  Save JSON
                </button>
              </div>
            </div>

            <textarea
              value={jsonDraft}
              onChange={(e) => setJsonDraft(e.target.value)}
              spellCheck={false}
              className="flex-1 min-h-[300px] p-3 rounded-2xl bg-h-surface-2 border border-h-border text-[11px] font-mono text-h-text focus:border-h-accent focus:outline-none resize-none"
            />

            {status && (
              <div
                className={`p-2.5 rounded-xl border text-xs font-medium ${
                  status.type === 'success'
                    ? 'bg-emerald-500/12 border-emerald-400/35 text-emerald-400'
                    : 'bg-rose-500/12 border-rose-400/35 text-rose-400'
                }`}
              >
                {status.text}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-h-border-soft bg-h-surface-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-3.5 py-2 rounded-xl bg-amber-500/12 hover:bg-amber-500/20 border border-amber-400/35 text-xs font-semibold text-amber-500 flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Official Defaults
          </button>

          <button
            type="button"
            onClick={handleApplyJson}
            className="px-4 py-2 rounded-xl bg-h-accent hover:bg-h-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            Apply JSON Preset
          </button>
        </div>
      </motion.div>
    </div>
  );
};
