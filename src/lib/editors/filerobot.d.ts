/**
 * Ambient type declarations for react-filerobot-image-editor v4.x
 * The published package may not ship complete TypeScript declarations,
 * so this file provides a minimal typed surface.
 */
declare module 'react-filerobot-image-editor' {
  import type { ComponentType, RefObject } from 'react';

  export type CropPresetItem = {
    titleKey: string;
    descriptionKey?: string;
    ratio?: number;
    width?: number;
    height?: number;
    icon?: string | HTMLElement | React.ComponentType;
    disableManualResize?: boolean;
    noEffect?: boolean;
  };

  export type SavedImageData = {
    name: string;
    extension: string;
    mimeType: string;
    fullName?: string;
    height?: number;
    width?: number;
    imageBase64?: string;
    imageCanvas?: HTMLCanvasElement;
    quality?: number;
  };

  export type ImageDesignState = {
    imgSrc: string;
    finetunes: any[];
    finetunesProps: Record<string, any>;
    filter: string | null;
    adjustments: {
      crop: any;
      isFlippedX: boolean;
      isFlippedY: boolean;
      rotation: number;
    };
    annotations: any[];
    resize: { width: number; height: number } | null;
    shownImageDimensions: { width: number; height: number };
  };

  export type GetCurrentImgDataFn = (
    imageFileInfo?: { name?: string; extension?: string; quality?: number },
    pixelRatio?: boolean | number,
    keepLoadingSpinnerShown?: boolean,
  ) => {
    imageData: SavedImageData;
    designState: ImageDesignState;
    hideLoadingSpinner: () => void;
  };

  export interface FilerobotImageEditorConfig {
    /** The image source — dataURL, URL string, or HTMLImageElement. */
    source: string | HTMLImageElement;

    /** Called when the user saves. */
    onSave?: (savedImageData: SavedImageData, designState: ImageDesignState) => void;

    /** Called when the user closes / cancels. */
    onClose?: () => void;

    /** Array of enabled tab IDs (ADJUST, FILTERS, ANNOTATE, CROP, etc.). */
    tabsIds?: string[];

    /** Pixel ratio used when saving the final image. Default: 4. */
    savingPixelRatio?: number;

    /** Pixel ratio for the preview. Default: 2. */
    previewPixelRatio?: number;

    /** Prevent "changes not saved" alert when leaving. */
    avoidChangesNotSavedAlertOnLeave?: boolean;

    /** Show only the canvas without the topbar / tabs. */
    showCanvasOnly?: boolean;

    /** Default tool to activate on mount. */
    defaultToolId?: string;

    /** Crop configuration. */
    Crop?: {
      presetsItems?: CropPresetItem[];
      presetsFolders?: Array<{ name: string; titleKey?: string; items: CropPresetItem[] }>;
    };

    /** Ref to receive the getCurrentImgData function. */
    getCurrentImgDataFnRef?: RefObject<GetCurrentImgDataFn | null>;

    /** Loadable design state (e.g., set default filter). */
    loadableDesignState?: {
      filter?: string;
      [key: string]: any;
    };

    /** Additional props are merged into the default config. */
    [key: string]: any;
  }

  const FilerobotImageEditor: ComponentType<FilerobotImageEditorConfig>;
  export default FilerobotImageEditor;

  /** Tab IDs */
  export const TABS: {
    ADJUST: string;
    FILTERS: string;
    ANNOTATE: string;
    CROP: string;
    ROTATE: string;
    RESIZE: string;
    WATERMARK: string;
    FLIP_X: string;
    FLIP_Y: string;
    [key: string]: string;
  };

  /** Tool IDs */
  export const TOOLS: {
    TEXT: string;
    RECT: string;
    ELLIPSE: string;
    ARROW: string;
    LINE: string;
    IMAGE: string;
    PEN: string;
    BRIGHTNESS: string;
    CONTRAST: string;
    HSV: string;
    WARMTH: string;
    BLUR: string;
    THRESHOLD: string;
    POSTERIZE: string;
    PIXELATE: string;
    NOISE: string;
    FILTERS: string;
    [key: string]: string;
  };
}
