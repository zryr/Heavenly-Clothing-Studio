import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  label: string;
}

const TOOL_SHORTCUTS: ShortcutRow[] = [
  { keys: ['V'], label: 'Pan / Hand Tool' },
  { keys: ['B'], label: 'Paint Brush' },
  { keys: ['I'], label: 'Eyedropper Color Sampler' },
  { keys: ['Alt', 'Click'], label: 'Quick Sample Color (while Painting)' },
  { keys: ['S'], label: 'Custom PNG Decal Stamp' },
  { keys: ['M'], label: 'Marquee Cut / Restore' },
  { keys: ['E'], label: 'Erase Brush' },
  { keys: ['R'], label: 'Restore Original Brush' },
  { keys: ['T'], label: 'Move / Transform Artwork' }
];

const WORKFLOW_SHORTCUTS: ShortcutRow[] = [
  { keys: ['['], label: 'Decrease Brush Diameter' },
  { keys: [']'], label: 'Increase Brush Diameter' },
  { keys: ['Space', 'Drag'], label: 'Temporary Pan Canvas' },
  { keys: ['Enter'], label: 'Apply Floating Decal Layer' },
  { keys: ['Esc'], label: 'Cancel Floating Decal / Modal' },
  { keys: ['Arrows'], label: 'Nudge Floating Decal 1px (Shift: 5px)' },
  { keys: ['Ctrl', 'Z'], label: 'Undo Last Step' },
  { keys: ['Ctrl', 'Y'], label: 'Redo Step' },
  { keys: ['Ctrl', 'S'], label: 'Save Project to Browser' },
  { keys: ['?'], label: 'Toggle Shortcuts Cheatsheet' }
];

const TOUCH_GESTURES: ShortcutRow[] = [
  { keys: ['2-Finger', 'Pinch'], label: 'Zoom In / Out (2D Canvas & directly on 3D Avatar)' },
  { keys: ['2-Finger', 'Tap'], label: 'Undo Last Stroke or Action (2D & 3D)' },
  { keys: ['3-Finger', 'Tap'], label: 'Redo Step (2D & 3D)' },
  { keys: ['Double', 'Tap'], label: 'Fit / 2× Zoom (2D Pan) · Reset Camera (3D)' }
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="shortcuts-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
        >
          <motion.div
            key="shortcuts-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard Shortcuts"
            data-testid="shortcuts-modal"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 430, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-h-surface border border-h-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
          >
            <div className="px-5 py-3.5 border-b border-h-border-soft flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-h-accent-soft text-h-accent-text flex items-center justify-center">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-h-text leading-tight">
                    Studio Shortcuts &amp; Touch Gestures
                  </h2>
                  <p className="text-[11px] text-h-muted">
                    Speed up 2D pixel editing, 3D inspection, touch zooming &amp; undo scrubbing
                  </p>
                </div>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                aria-label="Close Keyboard Shortcuts"
                className="w-8 h-8 rounded-lg hover:bg-h-surface-3 text-h-muted hover:text-h-text flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            <div className="p-5 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-h-accent-text">
                    2D Editor Tools
                  </h3>
                  <div className="divide-y divide-h-border-soft/70">
                    {TOOL_SHORTCUTS.map((row) => (
                      <div key={row.label} className="py-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-h-text-2">{row.label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {row.keys.map((k) => (
                            <kbd
                              key={k}
                              className="px-1.5 py-0.5 rounded-md bg-h-surface-2 border border-h-border font-mono text-[10px] font-semibold text-h-text"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-h-accent-text">
                    Canvas, Decals &amp; History
                  </h3>
                  <div className="divide-y divide-h-border-soft/70">
                    {WORKFLOW_SHORTCUTS.map((row) => (
                      <div key={row.label} className="py-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-h-text-2">{row.label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {row.keys.map((k) => (
                            <kbd
                              key={k}
                              className="px-1.5 py-0.5 rounded-md bg-h-surface-2 border border-h-border font-mono text-[10px] font-semibold text-h-text"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-h-border-soft space-y-2" data-testid="touch-gestures-guide">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-h-accent-text">
                  Touchscreen &amp; Multi-Touch Gestures
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0 divide-h-border-soft/70">
                  {TOUCH_GESTURES.map((row) => (
                    <div
                      key={row.label}
                      className="py-2 flex items-center justify-between gap-3 sm:border-b sm:border-h-border-soft/70"
                    >
                      <span className="text-xs text-h-text-2">{row.label}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {row.keys.map((k) => (
                          <kbd
                            key={k}
                            className="px-1.5 py-0.5 rounded-md bg-h-accent-soft/70 border border-h-accent-border/60 font-mono text-[10px] font-semibold text-h-accent-text"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
