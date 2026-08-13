import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Type, ImagePlus, Square, Circle, Triangle, ChevronUp, ChevronDown,
  Trash2, Eraser, Download, PenTool, Loader2,
} from 'lucide-react';
import type { CanvasManager } from '../../lib/editors/fabric/canvasManager';

interface OceanCanvasDesignProps {
  open: boolean;
  onClose: () => void;
  onExport: (blob: Blob) => void;
}

/** Internal resolution of the design surface (display is CSS-scaled). */
const CANVAS_SIZE = 1080;

function ToolButton({
  onClick,
  title,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border border-[#ebdcca] dark:border-zinc-700 bg-[#f9f7f2] dark:bg-zinc-800 text-[#3a342a] dark:text-zinc-200 hover:bg-[#ebdcca] dark:hover:bg-zinc-700 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-[#f9f7f2] dark:disabled:hover:bg-zinc-800 ${
        danger ? 'hover:text-red-600 dark:hover:text-red-400' : ''
      }`}
    >
      {children}
    </button>
  );
}

export default function OceanCanvasDesign({ open, onClose, onExport }: OceanCanvasDesignProps) {
  const canvasRef = React.createRef<HTMLCanvasElement>();
  const managerRef = useRef<CanvasManager | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [ready, setReady] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [exporting, setExporting] = useState(false);

  const toast = (message: string, variant = 'default') => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  };

  // Boot the fabric engine when the editor opens; dispose it on close/unmount.
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let manager: CanvasManager | null = null;
    setReady(false);
    setHasSelection(false);

    const init = async () => {
      const el = canvasRef.current;
      if (!el) return;
      try {
        // Lazy-load the engine so Fabric is only fetched when the editor opens.
        const { createCanvasManager } = await import('../../lib/editors/fabric/canvasManager');
        if (disposed) return;
        manager = createCanvasManager(el, {
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          onSelection: (obj) => {
            if (!disposed) setHasSelection(Boolean(obj));
          },
        });
        managerRef.current = manager;
        setReady(true);
      } catch (err) {
        console.error('Failed to initialise the canvas design editor.', err);
      }
    };
    void init();

    return () => {
      disposed = true;
      managerRef.current = null;
      void manager?.dispose();
    };
  }, [open]);

  // Close on Escape.
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

  const handleAddText = () => {
    const manager = managerRef.current;
    if (!manager) return;
    const text = window.prompt('Text for the canvas', 'Your text here');
    if (text === null) return; // cancelled
    if (!text.trim()) {
      toast('Enter some text first.', 'destructive');
      return;
    }
    manager.addText(text);
  };

  const handlePickImage = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    const manager = managerRef.current;
    if (!manager) return;
    try {
      await manager.addImageFromFile(file);
    } catch (err: any) {
      toast(err?.message || 'Could not load that image.', 'destructive');
    }
  };

  const handleAddShape = (type: 'rect' | 'circle' | 'triangle') => {
    managerRef.current?.addShape(type);
  };

  const handleMove = (dir: 'up' | 'down' | 'front' | 'back') => {
    managerRef.current?.moveLayer(dir);
  };

  const handleDelete = () => {
    managerRef.current?.removeSelected();
  };

  const handleClear = () => {
    const manager = managerRef.current;
    if (!manager || manager.getObjects().length === 0) return;
    if (!window.confirm('Clear the whole canvas?')) return;
    manager.clear();
  };

  const handleExport = async () => {
    const manager = managerRef.current;
    if (!manager || exporting) return;
    setExporting(true);
    try {
      const blob = await manager.toBlob('png', 2);
      onExport(blob);
      onClose();
    } catch (err: any) {
      toast(err?.message || 'Could not export the canvas.', 'destructive');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="w-full max-w-3xl bg-white/95 dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top bar */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#ebdcca] dark:border-zinc-800">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center shrink-0">
                  <PenTool className="text-amber-800 dark:text-amber-400" size={16} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-base sm:text-lg font-bold text-[#3a342a] dark:text-zinc-100 truncate">
                    Ocean Canvas Design
                  </h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 truncate">
                    Design editor · {CANVAS_SIZE}×{CANVAS_SIZE} canvas
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleExport}
                  disabled={exporting || !ready}
                  className="px-3.5 py-2 text-xs font-bold rounded-xl transition-all bg-amber-900 text-[#fcfaf4] hover:bg-amber-800 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Download size={13} />
                  {exporting ? 'Exporting…' : 'Export PNG'}
                </button>
                <button
                  onClick={onClose}
                  aria-label="Close design editor"
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#f9f7f2] dark:bg-zinc-800 text-[#3a342a] dark:text-zinc-200 border border-[#ebdcca] dark:border-zinc-700 hover:bg-[#ebdcca] dark:hover:bg-zinc-700 transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body: toolbar + stage */}
            <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5">
              {/* Toolbar */}
              <div className="flex sm:flex-col items-center gap-2 sm:shrink-0">
                <ToolButton onClick={handleAddText} title="Add text" disabled={!ready}>
                  <Type size={16} />
                </ToolButton>
                <ToolButton onClick={handlePickImage} title="Add image" disabled={!ready}>
                  <ImagePlus size={16} />
                </ToolButton>
                <ToolButton onClick={() => handleAddShape('rect')} title="Add rectangle" disabled={!ready}>
                  <Square size={16} />
                </ToolButton>
                <ToolButton onClick={() => handleAddShape('circle')} title="Add circle" disabled={!ready}>
                  <Circle size={16} />
                </ToolButton>
                <ToolButton onClick={() => handleAddShape('triangle')} title="Add triangle" disabled={!ready}>
                  <Triangle size={16} />
                </ToolButton>

                <span className="hidden sm:block w-8 h-px bg-[#ebdcca] dark:bg-zinc-700 my-1" />
                <span className="block sm:hidden w-px h-5 bg-[#ebdcca] dark:bg-zinc-700" />

                <ToolButton onClick={() => handleMove('up')} title="Move up" disabled={!ready || !hasSelection}>
                  <ChevronUp size={16} />
                </ToolButton>
                <ToolButton onClick={() => handleMove('down')} title="Move down" disabled={!ready || !hasSelection}>
                  <ChevronDown size={16} />
                </ToolButton>
                <ToolButton onClick={handleDelete} title="Delete selected" disabled={!ready || !hasSelection} danger>
                  <Trash2 size={16} />
                </ToolButton>
                <ToolButton onClick={handleClear} title="Clear all" disabled={!ready}>
                  <Eraser size={16} />
                </ToolButton>
              </div>

              {/* Stage */}
              <div className="flex-1 min-w-0 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#f9f7f2] dark:bg-zinc-950/40 flex items-center justify-center p-4">
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    className="rounded-xl bg-white shadow-inner max-w-full"
                    style={{
                      width: 'min(500px, 100%, 55vw)',
                      height: 'min(500px, 100%, 55vw)',
                      touchAction: 'none',
                    }}
                  />
                  {!ready && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 dark:bg-zinc-900/70">
                      <Loader2 className="text-amber-800 dark:text-amber-400 animate-spin" size={22} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Hidden file picker */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
