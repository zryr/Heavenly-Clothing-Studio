import React, { useState } from 'react';
import {
  Copy,
  Check,
  RotateCcw,
  Download,
  Upload,
  X,
  Code2,
  Sliders,
  Move,
  Info,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { UvIsland, TemplateType, ROBLOX_SHIRT_UV_ISLANDS, ROBLOX_PANTS_UV_ISLANDS } from '../types/uv';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  islands: UvIsland[];
  templateType: TemplateType;
  onUpdateIslands: (newIslands: UvIsland[]) => void;
  onResetToDefault: () => void;
}

export const UvDebugModal: React.FC<Props> = ({
  isOpen,
  onClose,
  islands,
  templateType,
  onUpdateIslands,
  onResetToDefault
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'ts' | 'json' | 'deltas' | 'import'>('ts');

  if (!isOpen) return null;

  const defaultIslands = templateType === 'shirt' ? ROBLOX_SHIRT_UV_ISLANDS : ROBLOX_PANTS_UV_ISLANDS;
  const constName = templateType === 'shirt' ? 'ROBLOX_SHIRT_UV_ISLANDS' : 'ROBLOX_PANTS_UV_ISLANDS';

  // Calculate deltas against defaults
  const deltas = islands.map((curr) => {
    const orig = defaultIslands.find((d) => d.name === curr.name);
    const dx = orig ? curr.x - orig.x : 0;
    const dy = orig ? curr.y - orig.y : 0;
    const dw = orig ? curr.w - orig.w : 0;
    const dh = orig ? curr.h - orig.h : 0;
    const hasChanged = dx !== 0 || dy !== 0 || dw !== 0 || dh !== 0;
    return {
      name: curr.name,
      group: curr.group,
      curr,
      orig,
      dx,
      dy,
      dw,
      dh,
      hasChanged
    };
  });

  const modifiedCount = deltas.filter((d) => d.hasChanged).length;

  // Clean formatted TypeScript code ready to hardcode in uv.ts
  const formattedTsCode = `// Roblox ${templateType === 'shirt' ? 'Shirt' : 'Pants'} Calibrated UV Island Coordinates\n// Copy & paste directly into src/types/uv.ts to hardcode\nexport const ${constName}: UvIsland[] = [\n` +
    islands.map((isl) =>
      `  { name: ${JSON.stringify(isl.name)}, x: ${Math.round(isl.x)}, y: ${Math.round(isl.y)}, w: ${Math.round(isl.w)}, h: ${Math.round(isl.h)}, group: ${JSON.stringify(isl.group)}${isl.description ? `, description: ${JSON.stringify(isl.description)}` : ''} }`
    ).join(',\n') +
    `\n];\n`;

  // Clean formatted JSON
  const formattedJson = JSON.stringify(
    islands.map(({ name, x, y, w, h, group }) => ({
      name,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
      group
    })),
    null,
    2
  );

  const handleCopy = () => {
    const textToCopy = activeTab === 'json' ? formattedJson : formattedTsCode;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const handleDownloadJson = () => {
    const blob = new Blob([formattedJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roblox_${templateType}_uv_coordinates_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyImport = () => {
    setImportError(null);
    setImportSuccess(false);

    try {
      const parsed = JSON.parse(importJsonText);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('JSON must be an array of UV island objects.');
      }

      // Validate structure
      const validated: UvIsland[] = parsed.map((item, idx) => {
        if (typeof item.name !== 'string') {
          throw new Error(`Item at index ${idx} is missing a string "name" property.`);
        }
        if (typeof item.x !== 'number' || typeof item.y !== 'number' || typeof item.w !== 'number' || typeof item.h !== 'number') {
          throw new Error(`"${item.name}" has invalid or non-numeric x, y, w, or h properties.`);
        }
        return {
          name: item.name,
          x: Math.round(item.x),
          y: Math.round(item.y),
          w: Math.round(item.w),
          h: Math.round(item.h),
          group: item.group || 'torso',
          description: item.description
        };
      });

      onUpdateIslands(validated);
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 3000);
    } catch (err: any) {
      setImportError(err.message || 'Invalid JSON syntax');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-[#0f131d] border border-[#232936] rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-[#e2e8f0]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#232936] bg-[#141824]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00e5ff]/15 border border-[#00e5ff]/30 flex items-center justify-center text-[#00e5ff]">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-mono text-white flex items-center space-x-2">
                <span>UV WIREFRAME COORDINATES DEBUGGER</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30">
                  {templateType}
                </span>
              </h3>
              <p className="text-[11px] text-[#94a3b8]">
                {modifiedCount > 0
                  ? `${modifiedCount} of ${islands.length} islands modified from official defaults`
                  : 'All islands currently at official default positions'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#94a3b8] hover:text-white rounded-lg hover:bg-[#1f2636] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 border-b border-[#1f2636] bg-[#0c0f17]">
          <div className="flex items-center space-x-1 bg-[#141822] p-1 rounded-lg border border-[#232936]">
            <button
              onClick={() => setActiveTab('ts')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-mono font-medium transition ${
                activeTab === 'ts'
                  ? 'bg-[#fbbf24] text-black font-bold shadow-sm'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>TypeScript Code (Hardcode)</span>
            </button>
            <button
              onClick={() => setActiveTab('json')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-mono font-medium transition ${
                activeTab === 'json'
                  ? 'bg-[#00e5ff] text-black font-bold shadow-sm'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
            <button
              onClick={() => setActiveTab('deltas')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-mono font-medium transition ${
                activeTab === 'deltas'
                  ? 'bg-[#00e5ff] text-black font-bold shadow-sm'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Deltas ({modifiedCount})</span>
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-mono font-medium transition ${
                activeTab === 'import'
                  ? 'bg-[#00e5ff] text-black font-bold shadow-sm'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import / Paste</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition shadow-lg ${
                copied
                  ? 'bg-[#10b981] text-black shadow-[#10b981]/30'
                  : 'bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] text-black hover:brightness-110 shadow-[#fbbf24]/20'
              }`}
              title="Copy code to clipboard so you can hardcode into src/types/uv.ts"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'COPIED TO CLIPBOARD!' : activeTab === 'ts' ? 'COPY TS CODE TO HARDCODE' : 'COPY COORDINATES'}</span>
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="p-5 overflow-y-auto flex-1 font-mono text-xs">
          {activeTab === 'ts' && (
            <div className="flex flex-col space-y-3">
              <div className="p-2.5 bg-[#fbbf24]/10 border border-[#fbbf24]/30 rounded-xl text-[11px] text-[#fbbf24] flex items-start space-x-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Ready to Hardcode: </span>
                  Click <span className="font-bold underline">"COPY TS CODE TO HARDCODE"</span> and paste it directly into <code className="bg-black/40 px-1 py-0.5 rounded text-white font-mono">src/types/uv.ts</code>. This permanently locks in your custom extended/nudged UV positions!
                </div>
              </div>

              <div className="relative">
                <pre className="p-3.5 bg-[#090b10] border border-[#232936] rounded-xl overflow-x-auto text-[#fde68a] text-[11px] leading-relaxed max-h-[360px] select-all font-mono">
                  {formattedTsCode}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'json' && (
            <div className="flex flex-col space-y-3">
              <div className="p-2.5 bg-[#00e5ff]/10 border border-[#00e5ff]/30 rounded-xl text-[11px] text-[#00e5ff] flex items-start space-x-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Ready to send to AI: </span>
                  Click <span className="font-bold underline">"COPY COORDINATES"</span> above and paste it directly into your chat response. This gives the exact pixel boundaries of every island on your template!
                </div>
              </div>

              <div className="relative">
                <pre className="p-3.5 bg-[#090b10] border border-[#232936] rounded-xl overflow-x-auto text-[#a5b4fc] text-[11px] leading-relaxed max-h-[360px] select-all font-mono">
                  {formattedJson}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'deltas' && (
            <div className="flex flex-col space-y-2">
              <p className="text-[11px] text-[#94a3b8] mb-1">
                Comparing current dragged positions with official standard Roblox specifications:
              </p>

              <div className="border border-[#232936] rounded-xl overflow-hidden divide-y divide-[#1e2433]">
                {deltas.map((d) => (
                  <div
                    key={d.name}
                    className={`flex items-center justify-between p-2.5 text-[11px] ${
                      d.hasChanged ? 'bg-[#00e5ff]/10 text-white' : 'bg-[#0f131d]/60 text-[#94a3b8]'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className={`w-2 h-2 rounded-full ${d.hasChanged ? 'bg-[#00e5ff]' : 'bg-[#334155]'}`} />
                      <span className="font-bold text-white">{d.name}</span>
                      <span className="text-[10px] text-[#64748b]">({d.group})</span>
                    </div>

                    <div className="flex items-center space-x-3 font-mono">
                      <span>
                        X: {d.curr.x} {d.dx !== 0 && <span className="text-[#00e5ff]">({d.dx > 0 ? `+${d.dx}` : d.dx}px)</span>}
                      </span>
                      <span>
                        Y: {d.curr.y} {d.dy !== 0 && <span className="text-[#00e5ff]">({d.dy > 0 ? `+${d.dy}` : d.dy}px)</span>}
                      </span>
                      <span>
                        W: {d.curr.w} {d.dw !== 0 && <span className="text-[#c084fc]">({d.dw > 0 ? `+${d.dw}` : d.dw})</span>}
                      </span>
                      <span>
                        H: {d.curr.h} {d.dh !== 0 && <span className="text-[#c084fc]">({d.dh > 0 ? `+${d.dh}` : d.dh})</span>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'import' && (
            <div className="flex flex-col space-y-3">
              <p className="text-[11px] text-[#94a3b8]">
                Paste a UV coordinates JSON array below to apply custom wireframe alignments:
              </p>

              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder='[&#10;  { "name": "Torso Top", "x": 231, "y": 74, "w": 128, "h": 64, "group": "torso" }&#10;]'
                rows={10}
                className="w-full p-3 bg-[#090b10] border border-[#232936] rounded-xl font-mono text-[11px] text-white focus:outline-none focus:border-[#00e5ff] placeholder-[#475569]"
              />

              {importError && (
                <div className="p-2.5 bg-[#ef4444]/20 border border-[#ef4444]/40 rounded-xl text-xs text-[#ef4444]">
                  {importError}
                </div>
              )}

              {importSuccess && (
                <div className="p-2.5 bg-[#10b981]/20 border border-[#10b981]/40 rounded-xl text-xs text-[#10b981] flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Custom coordinates applied successfully to canvas!</span>
                </div>
              )}

              <button
                onClick={handleApplyImport}
                disabled={!importJsonText.trim()}
                className="self-end px-4 py-2 rounded-xl bg-[#00e5ff] hover:bg-[#38bdf8] disabled:opacity-30 disabled:pointer-events-none text-black font-bold transition flex items-center space-x-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Coordinates</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#232936] bg-[#141824] text-xs">
          <div className="flex items-center space-x-2">
            <button
              onClick={onResetToDefault}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#1e2433] hover:bg-[#283246] text-[#94a3b8] hover:text-white border border-[#2d374d] transition"
              title="Reset all lines to Roblox official default positions"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>

            <button
              onClick={handleDownloadJson}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#1e2433] hover:bg-[#283246] text-[#94a3b8] hover:text-white border border-[#2d374d] transition"
              title="Download coordinates as a JSON file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save .json</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1f2636] hover:bg-[#2a3449] text-white font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
