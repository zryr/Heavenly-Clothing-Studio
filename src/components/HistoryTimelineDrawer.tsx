import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { History, Redo2, Undo2, X } from 'lucide-react';
import { HistoryTimelineItem } from '../types/studio';

interface HistoryTimelineDrawerProps {
  isOpen: boolean;
  items: HistoryTimelineItem[];
  currentIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onJumpTo: (index: number) => void;
  onClose: () => void;
}

export const HistoryTimelineDrawer: React.FC<HistoryTimelineDrawerProps> = ({
  isOpen,
  items,
  currentIndex,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onJumpTo,
  onClose
}) => {
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !stripRef.current) return;
    const activeEl = stripRef.current.querySelector('[data-active-step="true"]') as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [isOpen, currentIndex, items.length]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="history-timeline-drawer"
          data-testid="history-timeline-drawer"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="fixed left-3 right-3 sm:left-16 sm:right-6 bottom-16 md:bottom-9 z-40 bg-h-surface/96 border border-h-border rounded-2xl shadow-[0_14px_38px_rgba(2,6,23,0.45)] overflow-hidden"
        >
          {/* Compact Drawer Header */}
          <div className="px-3.5 py-2 border-b border-h-border-soft flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <History className="w-3.5 h-3.5 text-h-accent-text shrink-0" />
              <span className="text-[11px] font-bold text-h-text whitespace-nowrap">
                Undo History Timeline
              </span>
              <span className="text-[10px] font-mono text-h-muted">
                Step {Math.max(0, currentIndex + 1)} / {items.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!canUndo}
                onClick={onUndo}
                title="Undo (Ctrl+Z)"
                className="h-7 px-2 rounded-lg border border-h-border bg-h-surface-2 hover:border-h-accent-border text-[10px] font-semibold text-h-text-2 flex items-center gap-1 disabled:opacity-35 cursor-pointer"
              >
                <Undo2 className="w-3 h-3" />
                <span className="hidden sm:inline">Undo</span>
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={onRedo}
                title="Redo (Ctrl+Y)"
                className="h-7 px-2 rounded-lg border border-h-border bg-h-surface-2 hover:border-h-accent-border text-[10px] font-semibold text-h-text-2 flex items-center gap-1 disabled:opacity-35 cursor-pointer"
              >
                <Redo2 className="w-3 h-3" />
                <span className="hidden sm:inline">Redo</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close History Timeline"
                className="w-7 h-7 rounded-lg hover:bg-h-surface-3 text-h-muted hover:text-h-text flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filmstrip Cards */}
          <div
            ref={stripRef}
            className="p-2.5 flex items-stretch gap-2 overflow-x-auto"
          >
            {items.length === 0 ? (
              <div className="w-full py-4 text-center text-[11px] text-h-muted">
                Import, generate, or edit a garment to populate your visual history timeline.
              </div>
            ) : (
              items.map((item) => {
                const isCurrent = item.index === currentIndex;
                const isFuture = item.index > currentIndex;
                return (
                  <button
                    key={`${item.index}-${item.timestamp}`}
                    type="button"
                    data-testid={`history-step-${item.index}`}
                    data-active-step={isCurrent ? 'true' : 'false'}
                    onClick={() => onJumpTo(item.index)}
                    className={`shrink-0 w-[108px] rounded-xl border p-1.5 text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      isCurrent
                        ? 'bg-h-accent-soft border-h-accent ring-1 ring-h-accent/40'
                        : isFuture
                        ? 'bg-h-surface-2/60 border-h-border-soft opacity-55 hover:opacity-90 hover:border-h-accent-border'
                        : 'bg-h-surface-2 border-h-border hover:border-h-accent-border'
                    }`}
                  >
                    <div className="w-full h-14 rounded-lg border border-h-border-soft bg-h-canvas flex items-center justify-center overflow-hidden">
                      {item.thumbDataUrl ? (
                        <img
                          src={item.thumbDataUrl}
                          alt={item.label}
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <span className="text-[10px] font-mono text-h-muted">#{item.index + 1}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 px-0.5">
                      <span
                        className={`text-[10px] font-semibold truncate ${
                          isCurrent ? 'text-h-accent-text' : 'text-h-text'
                        }`}
                        title={item.label}
                      >
                        {item.label}
                      </span>
                      <span className="text-[9px] font-mono text-h-muted shrink-0">
                        #{item.index + 1}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
