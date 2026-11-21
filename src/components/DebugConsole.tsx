import React, { useState } from 'react';
import {
  Terminal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ChevronUp,
  ChevronDown,
  Trash2,
  Copy,
  Check,
  Activity,
  Cpu
} from 'lucide-react';

export interface DebugLogItem {
  id: string;
  time: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  details?: string;
}

interface Props {
  logs: DebugLogItem[];
  onClearLogs: () => void;
  onRunDiagnostics: () => void;
  canvasHealth: {
    isMainMounted: boolean;
    canvasWidth: number;
    canvasHeight: number;
    dirtyPixels: number;
    uvConformity: number;
    totalHistorySteps: number;
  };
}

export const DebugConsole: React.FC<Props> = ({
  logs,
  onClearLogs,
  onRunDiagnostics,
  canvasHealth
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const lastLog = logs[logs.length - 1];

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.time}] [${l.level.toUpperCase()}] ${l.message} ${l.details ? `(${l.details})` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-t border-[#232936] bg-[#0c0f16] font-mono text-xs z-30 transition-all">
      {/* Header / Toggle Strip */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 bg-[#121622] hover:bg-[#151a28] cursor-pointer border-b border-[#1c2230]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#00e5ff]/10 text-[#00e5ff] font-bold border border-[#00e5ff]/30 text-[10px]">
            <Terminal className="w-3 h-3" />
            <span>DEBUG CONSOLE</span>
          </div>

          {/* Quick status indicator */}
          <div className="flex items-center space-x-1.5 text-[11px] text-[#94a3b8]">
            <span
              className={`w-2 h-2 rounded-full ${
                canvasHealth.isMainMounted ? 'bg-[#10b981]' : 'bg-[#ef4444]'
              }`}
            />
            <span className="hidden sm:inline">
              Canvas: {canvasHealth.canvasWidth}×{canvasHealth.canvasHeight}
            </span>
            <span className="text-[#475569]">|</span>
            <span className="text-white truncate max-w-[200px] sm:max-w-[400px]">
              {lastLog ? `[${lastLog.time}] ${lastLog.message}` : 'Ready for asset ingestion.'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onRunDiagnostics}
            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#1e2538] hover:bg-[#28324a] text-[#00e5ff] text-[10px] font-semibold transition"
            title="Check internal canvas element and pixel state"
          >
            <Activity className="w-3 h-3" />
            <span>Test Health</span>
          </button>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 rounded text-[#94a3b8] hover:text-white transition"
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Logs Drawer */}
      {isOpen && (
        <div className="p-3 max-h-56 overflow-y-auto space-y-2 bg-[#090b10] border-t border-[#1a202c]">
          {/* Health Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] pb-2 border-b border-[#1c2230]">
            <div className="p-1.5 rounded bg-[#10141e] border border-[#232936]">
              <span className="text-[#64748b] block">MAIN CANVAS:</span>
              <span className={canvasHealth.isMainMounted ? 'text-[#10b981] font-bold' : 'text-[#ef4444] font-bold'}>
                {canvasHealth.isMainMounted ? `Mounted (${canvasHealth.canvasWidth}×${canvasHealth.canvasHeight})` : 'NOT MOUNTED'}
              </span>
            </div>

            <div className="p-1.5 rounded bg-[#10141e] border border-[#232936]">
              <span className="text-[#64748b] block">UV CONFORMITY:</span>
              <span className={canvasHealth.dirtyPixels === 0 ? 'text-[#10b981] font-bold' : 'text-[#ef4444] font-bold'}>
                {canvasHealth.uvConformity}% ({canvasHealth.dirtyPixels.toLocaleString()} dirty px)
              </span>
            </div>

            <div className="p-1.5 rounded bg-[#10141e] border border-[#232936]">
              <span className="text-[#64748b] block">HISTORY STACK:</span>
              <span className="text-[#00e5ff] font-bold">
                {canvasHealth.totalHistorySteps} snapshots active
              </span>
            </div>

            <div className="p-1.5 rounded bg-[#10141e] border border-[#232936] flex items-center justify-between">
              <div>
                <span className="text-[#64748b] block">LOGS RECORDED:</span>
                <span className="text-white font-bold">{logs.length} entries</span>
              </div>
              <div className="flex space-x-1">
                <button
                  onClick={handleCopyLogs}
                  className="p-1 text-[#94a3b8] hover:text-white rounded hover:bg-[#1c2230]"
                  title="Copy all logs"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#10b981]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={onClearLogs}
                  className="p-1 text-[#94a3b8] hover:text-[#ef4444] rounded hover:bg-[#1c2230]"
                  title="Clear log history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Log Stream */}
          <div className="space-y-1">
            {logs.length === 0 ? (
              <div className="text-[#475569] text-center py-3">No logs recorded yet.</div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start space-x-2 py-1 px-1.5 rounded hover:bg-[#141824] transition text-[11px]"
                >
                  <span className="text-[#64748b] text-[10px] flex-shrink-0">[{log.time}]</span>

                  {log.level === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981] flex-shrink-0 mt-0.5" />
                  ) : log.level === 'warn' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-[#f59e0b] flex-shrink-0 mt-0.5" />
                  ) : log.level === 'error' ? (
                    <XCircle className="w-3.5 h-3.5 text-[#ef4444] flex-shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0 mt-0.5" />
                  )}

                  <div className="flex-1 break-words">
                    <span
                      className={
                        log.level === 'error'
                          ? 'text-[#fca5a5] font-semibold'
                          : log.level === 'warn'
                          ? 'text-[#fde68a]'
                          : log.level === 'success'
                          ? 'text-[#86efac]'
                          : 'text-[#e2e8f0]'
                      }
                    >
                      {log.message}
                    </span>
                    {log.details && (
                      <span className="text-[#64748b] block text-[10px] mt-0.5">{log.details}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
