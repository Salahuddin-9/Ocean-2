import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2 } from 'lucide-react';
import FilerobotImageEditor, { TABS } from 'react-filerobot-image-editor';
import { dataUrlToBlob, fileToDataUrl } from '../../lib/editors/media';

/**
 * Photo editor modal wrapping FilerobotImageEditor — react-filerobot-image-editor
 * v4.9.1 (verified from local source in `filerobot-image-editor-master`, which
 * matches the published package).
 *
 * v4 API notes (these differ from v3 docs):
 *   source              — string (dataURL / URL) | HTMLImageElement  (NOT `src`)
 *   onSave              — (savedImageData: { imageBase64? }, designState) => void
 *   onClose             — () => void
 *   tabsIds             — array of TABS ids
 *   savingPixelRatio    — number (default 4, used for high-res export)
 *   avoidChangesNotSavedAlertOnLeave — boolean
 *   Crop.presetsItems   — crop presets (square / 9:16 / 16:9)
 *
 * There is NO `isOpen` prop in v4 — visibility is controlled by mount/unmount.
 */

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

interface PhotoEditorModalProps {
  /** Image source — URL/dataURL string, a File, or a Blob. */
  src: string | File | Blob | null;
  open: boolean;
  onClose: () => void;
  /** Called with the final high-res PNG blob. */
  onSave: (blob: Blob) => void;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function PhotoEditorModal({ src, open, onClose, onSave }: PhotoEditorModalProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ---- Resolve File/Blob to dataURL ---- */
  useEffect(() => {
    if (!src || !open) {
      setResolvedSrc(null);
      return;
    }
    if (typeof src === 'string') {
      setResolvedSrc(src);
      return;
    }
    setResolving(true);
    fileToDataUrl(src)
      .then(setResolvedSrc)
      .catch(() => console.error('[PhotoEditorModal] Failed to resolve source.'))
      .finally(() => setResolving(false));
  }, [src, open]);

  /* ---- Save handler (v4.9.1 API: onSave(savedImageData, designState)) ---- */
  const handleSave = useCallback(
    async (savedImageData: any, _designState: any) => {
      try {
        setSaving(true);
        const dataUrl = savedImageData?.imageBase64;
        if (!dataUrl) {
          console.error('[PhotoEditorModal] No imageBase64 in save data.');
          return;
        }
        const blob = await dataUrlToBlob(dataUrl);
        onSave(blob);
        onClose();
      } catch (err) {
        console.error('[PhotoEditorModal] Save error:', err);
      } finally {
        setSaving(false);
      }
    },
    [onSave, onClose]
  );

  /* ---- Escape to close ---- */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, saving, onClose]);

  /* ---- Body scroll lock ---- */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="photo-editor-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl shadow-2xl w-[96vw] h-[94vh] overflow-hidden flex flex-col relative"
          >
            {/* Loading / Saving overlay */}
            {(resolving || saving) && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
                <Loader2 size={28} className="text-amber-900 animate-spin" />
                <span className="ml-2 text-sm font-mono text-[#8a8172]">
                  {saving ? 'Saving…' : 'Loading image…'}
                </span>
              </div>
            )}

            {/* Close button */}
            {!saving && (
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-50 bg-white/90 hover:bg-white text-[#3a342a] p-2 rounded-full shadow-lg transition-colors"
                title="Close editor"
              >
                <X size={18} />
              </button>
            )}

            {/* Filerobot editor (v4 API) */}
            {resolvedSrc && (
              <FilerobotImageEditor
                source={resolvedSrc}
                key={`src-${resolvedSrc.length}-${resolvedSrc.slice(-12)}`}
                onSave={handleSave}
                onClose={onClose}
                tabsIds={[TABS.ADJUST, TABS.FILTERS, TABS.ANNOTATE, TABS.CROP]}
                savingPixelRatio={4}
                previewPixelRatio={2}
                avoidChangesNotSavedAlertOnLeave
                Crop={{
                  presetsItems: [
                    { titleKey: 'square', descriptionKey: '1:1', ratio: 1 },
                    { titleKey: 'portrait', descriptionKey: '9:16', ratio: 9 / 16 },
                    { titleKey: 'landscape', descriptionKey: '16:9', ratio: 16 / 9 },
                  ],
                  presetsFolders: [],
                }}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}