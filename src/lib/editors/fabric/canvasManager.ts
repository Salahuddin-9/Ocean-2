/**
 * Ocean — Fabric.js v7 canvas manager
 * ------------------------------------
 * Typed wrapper around a Fabric v7 `Canvas` for the 1080×1080 design surface.
 * Owns the full lifecycle: creation, object mutation, layer ordering, selection
 * reporting, PNG/JPEG export and teardown (revoking every object-URL created
 * for dropped images, then awaiting `canvas.dispose()`).
 *
 * Fabric v7 API facts this wrapper relies on:
 *  - `FabricImage.fromURL(url, opts)` is ASYNC (returns a Promise) — Blob URLs
 *    from `URL.createObjectURL` are used for File/Blob sources.
 *  - `canvas.toBlob({ format, multiplier })` returns `Promise<Blob | null>`
 *    (preferred over `toDataURL`).
 *  - `canvas.dispose()` is the safe, public teardown (returns a Promise). The
 *    private `destroy()` must never be called by consumers.
 *  - Selection is surfaced via `selection:created` / `selection:updated` /
 *    `selection:cleared`.
 */

import {
  Canvas,
  FabricImage,
  Textbox,
  Rect,
  Circle,
  Triangle,
  // Additional Fabric primitives available to the shape toolkit (kept for
  // future line / group / polygon / ellipse tooling).
  Line,
  Group,
  Polygon,
  Ellipse,
  type FabricObject,
} from 'fabric';

export interface CanvasManagerOpts {
  width: number;
  height: number;
  /** Called whenever the active selection changes (created / moved / cleared). */
  onSelection?: (obj: FabricObject | null) => void;
}

export interface AddTextOptions {
  left?: number;
  top?: number;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
}

export type ShapeType = 'rect' | 'circle' | 'triangle';
export type LayerDirection = 'up' | 'down' | 'front' | 'back';

export interface CanvasManager {
  addImageFromFile(file: File): Promise<void>;
  addImageFromUrl(url: string): Promise<void>;
  addText(text: string, opts?: AddTextOptions): Textbox;
  addShape(type: ShapeType): FabricObject;
  removeSelected(): void;
  clear(): void;
  moveLayer(dir: LayerDirection): void;
  getObjects(): FabricObject[];
  getSelectedObject(): FabricObject | undefined;
  toBlob(format?: 'png' | 'jpeg', multiplier?: number): Promise<Blob>;
  dispose(): Promise<void>;
}

/** White "paper" under the design so PNG exports aren't transparent. */
const CANVAS_PAPER = '#ffffff';

/** Palette used by the quick shape tools. */
const SHAPE_COLORS: Record<ShapeType, string> = {
  rect: '#4a90d9',
  circle: '#e74c3c',
  triangle: '#2ecc71',
};

export function createCanvasManager(
  canvasEl: HTMLCanvasElement,
  opts: Partial<CanvasManagerOpts> = {}
): CanvasManager {
  const { width = 1080, height = 1080, onSelection } = opts;

  const canvas = new Canvas(canvasEl, {
    width,
    height,
    backgroundColor: CANVAS_PAPER,
    // Keep objects visually stacked in place even while a selection is active.
    preserveObjectStacking: true,
  });

  /** Object URLs created for File-backed images — all revoked on dispose. */
  const createdUrls: string[] = [];
  let disposed = false;

  const reportSelection = (): void => {
    if (!disposed) onSelection?.(canvas.getActiveObject() ?? null);
  };

  canvas.on('selection:created', reportSelection);
  canvas.on('selection:updated', reportSelection);
  canvas.on('selection:cleared', () => {
    if (!disposed) onSelection?.(null);
  });

  /** Center an image on the canvas, shrinking it to fit when oversized. */
  const placeImage = (img: FabricImage): void => {
    const scale = Math.min(1, width / img.width, height / img.height);
    if (scale < 1) img.scale(scale);
    img.set({
      left: (width - img.getScaledWidth()) / 2,
      top: (height - img.getScaledHeight()) / 2,
    });
    canvas.add(img);
    canvas.setActiveObject(img);
  };

  const addImageFromUrl = async (url: string): Promise<void> => {
    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    if (disposed) return; // closed while the image was still loading
    placeImage(img);
  };

  const addImageFromFile = async (file: File): Promise<void> => {
    const url = URL.createObjectURL(file);
    createdUrls.push(url);
    try {
      // Blob URLs are same-origin — no crossOrigin needed here.
      const img = await FabricImage.fromURL(url);
      if (disposed) return;
      placeImage(img);
    } catch (err) {
      // Failed to decode — drop the URL now and rethrow for the UI.
      const idx = createdUrls.indexOf(url);
      if (idx !== -1) createdUrls.splice(idx, 1);
      URL.revokeObjectURL(url);
      throw err;
    }
  };

  const addText = (text: string, textOpts: AddTextOptions = {}): Textbox => {
    const tb = new Textbox(text, {
      left: textOpts.left ?? width / 2,
      top: textOpts.top ?? height / 2,
      fontSize: textOpts.fontSize ?? 64,
      fontFamily: textOpts.fontFamily ?? 'Arial',
      fill: textOpts.fill ?? '#3a342a',
      width: width * 0.6, // generous wrap box so long captions stay on-canvas
      originX: 'center',
      originY: 'center',
    });
    canvas.add(tb);
    canvas.setActiveObject(tb);
    return tb;
  };

  const addShape = (type: ShapeType): FabricObject => {
    const common = {
      left: 200,
      top: 200,
      fill: SHAPE_COLORS[type],
      objectCaching: false,
    };
    const shape: FabricObject =
      type === 'rect'
        ? new Rect({ ...common, width: 150, height: 150, rx: 8, ry: 8 })
        : type === 'circle'
          ? new Circle({ ...common, radius: 75 })
          : new Triangle({ ...common, width: 150, height: 150 });
    canvas.add(shape);
    canvas.setActiveObject(shape);
    return shape;
  };

  const removeSelected = (): void => {
    const obj = canvas.getActiveObject();
    if (obj) {
      canvas.remove(obj);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
  };

  const clear = (): void => {
    if (canvas.getObjects().length === 0) return;
    canvas.remove(...canvas.getObjects());
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  };

  const moveLayer = (dir: LayerDirection): void => {
    const obj = canvas.getActiveObject();
    if (!obj) return;
    switch (dir) {
      case 'up':
        canvas.bringObjectForward(obj);
        break;
      case 'down':
        canvas.sendObjectBackwards(obj);
        break;
      case 'front':
        canvas.bringObjectToFront(obj);
        break;
      case 'back':
        canvas.sendObjectToBack(obj);
        break;
    }
    canvas.requestRenderAll();
  };

  const getObjects = (): FabricObject[] => canvas.getObjects();

  const getSelectedObject = (): FabricObject | undefined =>
    canvas.getActiveObject() ?? undefined;

  const toBlob = async (
    format: 'png' | 'jpeg' = 'png',
    multiplier = 1
  ): Promise<Blob> => {
    const blob = await canvas.toBlob({ format, multiplier });
    if (!blob) throw new Error('Canvas export returned a null blob.');
    return blob;
  };

  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    for (const url of createdUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
    createdUrls.length = 0;
    canvas.off();
    await canvas.dispose();
  };

  return {
    addImageFromFile,
    addImageFromUrl,
    addText,
    addShape,
    removeSelected,
    clear,
    moveLayer,
    getObjects,
    getSelectedObject,
    toBlob,
    dispose,
  };
}
