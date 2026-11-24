import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Download,
  FolderOpen,
  History,
  Layers,
  Save,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { StudioProjectRecord, StudioProjectSummary } from '../types/studio';
import { getTemplateSpec } from '../types/uv';
import {
  deleteProject,
  listProjects,
  loadAutoDraft,
  loadProject,
  parsePortableProjectFile,
  serializeProjectToFile
} from '../utils/projectStorage';

interface ProjectsModalProps {
  currentProjectName: string;
  hasImage: boolean;
  loadedSlotCount: number;
  onSaveCurrentProject: (name: string, saveAsLookbook: boolean) => Promise<void>;
  onOpenProject: (record: StudioProjectRecord) => Promise<void>;
  onClose: () => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  currentProjectName,
  hasImage,
  loadedSlotCount,
  onSaveCurrentProject,
  onOpenProject,
  onClose
}) => {
  const [projects, setProjects] = useState<StudioProjectSummary[]>([]);
  const [hasAutoDraft, setHasAutoDraft] = useState(false);
  const [autoDraftUpdatedAt, setAutoDraftUpdatedAt] = useState<number | null>(null);
  const [saveName, setSaveName] = useState(currentProjectName || 'Untitled Garment');
  const [saveAsLookbook, setSaveAsLookbook] = useState(loadedSlotCount >= 2);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const refreshList = async () => {
    setLoading(true);
    try {
      for (const u of objectUrlsRef.current) URL.revokeObjectURL(u);
      objectUrlsRef.current = [];
      const res = await listProjects();
      for (const p of res.projects) {
        if (p.thumbnailUrl) objectUrlsRef.current.push(p.thumbnailUrl);
      }
      setProjects(res.projects);
      setHasAutoDraft(res.hasAutoDraft);
      setAutoDraftUpdatedAt(res.autoDraftUpdatedAt);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to read local project library.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshList();
    return () => {
      for (const u of objectUrlsRef.current) URL.revokeObjectURL(u);
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasImage && !(saveAsLookbook && loadedSlotCount > 0)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const wantLookbook = saveAsLookbook && loadedSlotCount >= 2;
      await onSaveCurrentProject(saveName.trim() || 'Untitled Garment', wantLookbook);
      await refreshList();
      setFeedback({
        type: 'success',
        text: wantLookbook
          ? `Saved full outfit lookbook "${saveName.trim() || 'Untitled Garment'}" (${loadedSlotCount} slots).`
          : `Saved "${saveName.trim() || 'Untitled Garment'}" locally.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save project.'
      });
    } finally {
      setBusy(false);
    }
  };

  const handleLoadId = async (id: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      const rec = await loadProject(id);
      if (!rec) throw new Error('Project record not found.');
      await onOpenProject(rec);
      onClose();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not open project.'
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreDraft = async () => {
    setBusy(true);
    try {
      const draft = await loadAutoDraft();
      if (!draft) throw new Error('No recovery draft available.');
      await onOpenProject(draft);
      onClose();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not load recovery draft.'
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProject(id);
      setConfirmDeleteId(null);
      await refreshList();
      setFeedback({ type: 'success', text: 'Deleted saved project.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not delete project.'
      });
    }
  };

  const handleExportPortable = async (id: string) => {
    try {
      const rec = await loadProject(id);
      if (!rec) return;
      const json = await serializeProjectToFile(rec);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rec.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Heavenly_Project'}.hcs.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedback({ type: 'success', text: 'Exported portable .hcs.json project backup.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not export project file.'
      });
    }
  };

  const handleImportPortable = async (file: File) => {
    setBusy(true);
    setFeedback(null);
    try {
      const text = await file.text();
      const record = await parsePortableProjectFile(text);
      await onOpenProject(record);
      onClose();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Invalid project file.'
      });
    } finally {
      setBusy(false);
    }
  };

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
      aria-labelledby="projects-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-h-surface border border-h-border rounded-3xl shadow-[0_24px_64px_rgba(15,23,42,0.18)] overflow-hidden flex flex-col max-h-[88vh] text-h-text"
      >
        <div className="px-5 py-4 border-b border-h-border-soft bg-h-surface-2 flex items-center justify-between">
          <div>
            <h2 id="projects-modal-title" className="font-display text-lg font-bold text-h-text">
              Studio Projects
            </h2>
            <p className="text-xs text-h-muted">
              Stored privately in your browser via IndexedDB, with portable .hcs.json backup support.
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

        <div className="p-5 overflow-y-auto space-y-5">
          <form
            onSubmit={handleSave}
            className="p-3.5 rounded-2xl bg-h-surface-2 border border-h-border space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-h-text">Save Current Session</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-semibold text-h-accent-text hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                Import .hcs.json
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.hcs.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportPortable(f);
                  e.target.value = '';
                }}
              />
            </div>

            {loadedSlotCount >= 2 && (
              <div className="grid grid-cols-2 gap-1 bg-h-surface p-1 rounded-xl border border-h-border-soft">
                <button
                  type="button"
                  onClick={() => setSaveAsLookbook(false)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    !saveAsLookbook
                      ? 'bg-h-accent-soft text-h-accent-text'
                      : 'text-h-muted hover:text-h-text'
                  }`}
                >
                  Active Slot Only
                </button>
                <button
                  type="button"
                  onClick={() => setSaveAsLookbook(true)}
                  data-testid="save-mode-lookbook-btn"
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                    saveAsLookbook
                      ? 'bg-h-accent-soft text-h-accent-text'
                      : 'text-h-muted hover:text-h-text'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  Full Outfit Lookbook ({loadedSlotCount} slots)
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={saveAsLookbook ? 'Outfit Lookbook name...' : 'Project name...'}
                data-testid="project-name-input"
                className="flex-1 h-9 px-3 rounded-xl bg-h-surface border border-h-border text-xs text-h-text focus:border-h-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={(!hasImage && !(saveAsLookbook && loadedSlotCount > 0)) || busy}
                data-testid="project-save-btn"
                className="h-9 px-4 rounded-xl bg-h-accent hover:bg-h-accent-hover disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                {saveAsLookbook && loadedSlotCount >= 2 ? 'Save Lookbook' : 'Save Project'}
              </button>
            </div>
            {!hasImage && loadedSlotCount === 0 && (
              <p className="text-[11px] text-h-muted">
                Load or import an image before saving a project.
              </p>
            )}
          </form>

          {hasAutoDraft && (
            <div className="p-3 rounded-2xl bg-h-surface-3 border border-[#BFDBFE] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-h-accent-text shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-h-text">Automatic Recovery Draft</p>
                  <p className="text-[11px] text-h-text-2">
                    Saved {autoDraftUpdatedAt ? new Date(autoDraftUpdatedAt).toLocaleString() : 'recently'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleRestoreDraft}
                className="px-3 py-1.5 rounded-xl bg-h-accent hover:bg-h-accent-hover text-white text-xs font-semibold cursor-pointer"
              >
                Recover
              </button>
            </div>
          )}

          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/12 border-emerald-400/35 text-emerald-400'
                  : 'bg-rose-500/12 border-rose-400/35 text-rose-400'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-h-text-2 uppercase tracking-wider">
              Saved Library ({projects.length})
            </h3>

            {loading ? (
              <div className="py-10 text-center text-xs text-h-muted">
                Loading saved projects...
              </div>
            ) : projects.length === 0 ? (
              <div className="py-10 text-center rounded-2xl border border-dashed border-[#CBDDF5] text-xs text-h-muted">
                No saved projects yet. Save your active garment above to reopen it anytime.
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => {
                  const spec = getTemplateSpec(p.templateType);
                  return (
                    <div
                      key={p.id}
                      data-testid={`saved-project-row-${p.id}`}
                      className="p-2.5 rounded-2xl bg-h-surface-2 border border-h-border-soft flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl checkerboard-surface border border-h-border overflow-hidden shrink-0 flex items-center justify-center">
                          {p.thumbnailUrl ? (
                            <img
                              src={p.thumbnailUrl}
                              alt={p.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <FolderOpen className="w-4 h-4 text-h-muted" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-h-text truncate">{p.name}</p>
                          <p className="text-[11px] text-h-muted">
                            {p.isOutfitLookbook
                              ? `Outfit Lookbook · ${p.outfitSlotCount ?? 2} slots`
                              : spec.label}{' '}
                            · {new Date(p.updatedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleLoadId(p.id)}
                          className="px-3 py-1.5 rounded-xl bg-h-accent-soft hover:bg-h-accent-soft border border-h-accent-border text-h-accent-text text-xs font-semibold cursor-pointer"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportPortable(p.id)}
                          title="Export .hcs.json backup"
                          className="p-1.5 rounded-xl bg-h-surface hover:bg-h-surface-3 border border-h-border text-h-text-2 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === p.id ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            className="px-2 py-1.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-400 text-[11px] font-semibold cursor-pointer"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(p.id)}
                            title="Delete project"
                            className="p-1.5 rounded-xl bg-h-surface hover:bg-rose-500/12 border border-h-border text-h-muted hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
