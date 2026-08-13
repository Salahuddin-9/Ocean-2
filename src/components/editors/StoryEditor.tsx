import { Suspense, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tldraw, type Editor } from '@tldraw/tldraw';
import { X, Download, Trash2 } from 'lucide-react';
import '@tldraw/tldraw/tldraw.css';

interface StoryEditorProps {
  open: boolean;
  onClose: () => void;
  onExport: (blob: Blob) => void;
}

/**
 * Ocean Story Editor — the same tldraw engine as the Whiteboard, but
 * constrained to a 9:16 mobile-story viewport (Ocean Stories 2.0, #249).
 * Drawings, overlays and annotations live inside the story-shaped canvas;
 * a caption field sits below for the parent flow to consume.
 */
export default function StoryEditor({ open, onClose, onExport }: StoryEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const [exporting, setExporting] = useState(false);
  const [caption, setCaption] = useState('');

  const toast = (message: string, variant: 'default' | 'destructive' = 'default') => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  };

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while the editor is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleExport = async () => {
    const editor = editorRef.current;
    if (!editor || exporting) return;
    // `toImage([])` exports the current page; tldraw throws "Could not create
    // SVG" when the page has no shapes, so guard against an empty canvas.
    if (editor.getCurrentPageShapeIds().size === 0) {
      toast('Draw something first, then export.', 'destructive');
      return;
    }
    setExporting(true);
    try {
      const { blob } = await editor.toImage([], {
        format: 'png',
        scale: 2,
        background: true,
      });
      onExport(blob);
      toast('Story exported as PNG.');
    } catch (err: any) {
      toast(err?.message || 'Could not export the story.', 'destructive');
    } finally {
      setExporting(false);
    }
  };

  const handleClear = () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!window.confirm('Clear the whole story canvas?')) return;
    // tldraw v5 clear-all: select everything, then delete the selection.
    editor.markHistoryStoppingPoint('clear');
    editor.selectAll();
    editor.deleteShapes(editor.getSelectedShapeIds());
    toast('Story canvas cleared.');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="bg-white/95 dark:bg-zinc-900 rounded-3xl shadow-2xl w-[95vw] h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top bar */}
            <div className="flex items-center justify-between p-3 border-b border-[#ebdcca] dark:border-zinc-800">
              <h2 className="font-display text-base sm:text-lg font-bold text-[#3a342a] dark:text-zinc-100 truncate">
                📱 Ocean Story Editor
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  className="bg-amber-900 text-[#fcfaf4] px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Download size={13} />
                  {exporting ? 'Exporting…' : 'Export PNG'}
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="bg-red-50 text-red-700 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-red-100 border border-red-200 flex items-center gap-1.5"
                >
                  <Trash2 size={13} />
                  Clear
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close story editor"
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#f9f7f2] dark:bg-zinc-800 text-[#3a342a] dark:text-zinc-200 border border-[#ebdcca] dark:border-zinc-700 hover:bg-[#ebdcca] dark:hover:bg-zinc-700 transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Story canvas, constrained to a 9:16 viewport */}
            <div className="flex-1 relative min-h-0 flex items-center justify-center p-4 bg-[#f9f7f2] dark:bg-zinc-950/40">
              <div
                className="relative bg-white dark:bg-zinc-950 rounded-2xl shadow-inner overflow-hidden"
                style={{
                  aspectRatio: '9 / 16',
                  maxHeight: '80vh',
                  maxWidth: 'calc(80vh * 9 / 16)',
                  width: '100%',
                }}
              >
                <Suspense
                  fallback={
                    <div className="h-full w-full flex items-center justify-center text-[#8a8172] dark:text-zinc-400 text-sm">
                      Loading tldraw...
                    </div>
                  }
                >
                  <Tldraw
                    onMount={(editor) => {
                      editorRef.current = editor;
                      return () => {
                        editorRef.current = null;
                      };
                    }}
                  />
                </Suspense>
              </div>
            </div>

            {/* Caption */}
            <div className="p-3 border-t border-[#ebdcca] dark:border-zinc-800">
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption..."
                className="border border-[#ebdcca] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 rounded-xl p-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-800/40"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
