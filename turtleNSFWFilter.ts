/**
 * Turtle Social Media Application — NSFW Safety Filter Engine (Client-side)
 *
 * Powers the platform's adult-content blocking system using the NSFWJS
 * (TensorFlow.js) model hosted in /public/models (from the nsfwjs-master repo).
 *
 * -----------------------------------------------------------------------------------------
 * CORE FUNCTIONALITIES:
 * 1. Lazy singleton NSFWJS model loader (MobileNetV2, hosted model.json — smaller bundle).
 * 2. verdictFromPredictions: maps raw class probabilities to safe / blur / block verdicts.
 * 3. screenImageSource: classify any image URL / data-URL / blob URL.
 * 4. screenImageFile: classify a File object picked by the user before upload.
 * 5. In-memory result cache to avoid re-screening identical sources.
 * 6. Graceful fail-open: if the model cannot load, screening returns 'safe' so the
 *    demo remains fully interactive (the server route /api/nsfw/check is the
 *    authoritative second line of defense).
 * -----------------------------------------------------------------------------------------
 */

export type NSFWVerdict = 'safe' | 'blur' | 'block';

export interface NSFWPrediction {
  className: string;
  probability: number;
}

export interface NSFWScreenResult {
  verdict: NSFWVerdict;
  predictions: NSFWPrediction[];
  topClass: string;
  topProbability: number;
  engine: 'nsfwjs' | 'open_nsfw' | 'off';
}

export const SAFETY_KEYWORDS = [
  'porn', 'hentai', 'gore', 'blood', 'decapitation', 'mutilation',
  'suicide', 'murder', 'slaughter', 'beheading', 'violence', 'bloodspot'
];

/** Text safety screening for NSFW, blood, violence, and gore keywords */
export function screenContentText(text: string): NSFWVerdict {
  if (!text) return 'safe';
  const lower = text.toLowerCase();
  for (const kw of SAFETY_KEYWORDS) {
    if (lower.includes(kw)) {
      return 'blur';
    }
  }
  return 'safe';
}

/** Hosted MobileNetV2 model (served from the public folder). */
export const NSFW_MODEL_URL = '/models/mobilenet_v2/model.json';

/**
 * Tunable screening policy.
 *
 * IMPORTANT: the NSFWJS MobileNetV2 "Sexy" class is notoriously noisy on
 * ordinary photos (portraits, fashion, swimwear, dancing). To avoid blurring
 * every normal feed image we require a HIGH combined explicit probability
 * before blurring, and only hard-block on Porn/Hentai.
 */
export const NSFW_THRESHOLDS = {
  blockPorn: 0.75,
  blockHentai: 0.75,
  blockCombined: 0.85,
  // Blur requires a *very* high Sexy confidence AND some explicit signal.
  blurSexy: 0.92,
  blurSexyMinExplicit: 0.10,
};

/** Maps NSFWJS predictions to a verdict using the thresholds above. */
export function verdictFromPredictions(
  predictions: NSFWPrediction[],
): { verdict: NSFWVerdict; topClass: string; topProbability: number } {
  const byClass: Record<string, number> = {};
  let topClass = 'Neutral';
  let topProbability = 0;

  for (const p of predictions) {
    byClass[p.className] = p.probability;
    if (p.probability > topProbability) {
      topProbability = p.probability;
      topClass = p.className;
    }
  }

  const porn = byClass['Porn'] ?? 0;
  const hentai = byClass['Hentai'] ?? 0;
  const sexy = byClass['Sexy'] ?? 0;
  const explicit = porn + hentai;

  // 1. Hard block — explicit content above threshold.
  if (
    porn >= NSFW_THRESHOLDS.blockPorn ||
    hentai >= NSFW_THRESHOLDS.blockHentai ||
    explicit >= NSFW_THRESHOLDS.blockCombined
  ) {
    return { verdict: 'block', topClass, topProbability };
  }

  // 2. Blur — requires BOTH a very high "Sexy" confidence AND a meaningful
  //    explicit (Porn+Hentai) signal. The old `porn+hentai+sexy >= blurCombined`
  //    clause was a bug: the NSFWJS model's five classes sum to 1.0, so a high
  //    "Sexy" score alone (very common on innocent fashion/fitness/portrait
  //    photos) tripped the combined threshold and blurred the whole feed.
  //    That clause is removed — an image only blurs when genuine adult signal
  //    is present on top of the "Sexy" classification.
  if (sexy >= NSFW_THRESHOLDS.blurSexy && explicit >= NSFW_THRESHOLDS.blurSexyMinExplicit) {
    return { verdict: 'blur', topClass, topProbability };
  }

  return { verdict: 'safe', topClass, topProbability };
}

const SCREEN_TIMEOUT_MS = 4000;

let modelPromise: Promise<any | null> | null = null;
let modelState: 'idle' | 'loading' | 'ready' | 'off' = 'idle';
let lastModelAttempt = 0;
const MODEL_RETRY_MS = 60_000;

/**
 * True once the NSFWJS model has loaded successfully at least once.
 * SafeImage uses this to skip the "Checking…" dim state when the model
 * is unavailable (or still loading) so images never look blurred/broken.
 */
export function isNSFWModelAvailable(): boolean {
  return modelState === 'ready';
}

/**
 * Lazily loads (and caches) the NSFWJS model. Uses a dynamic import so the
 * heavy TensorFlow.js bundle is only fetched the first time screening runs.
 *
 * Failure is cached for 60s ('off' state) so a broken model URL does NOT
 * cause hundreds of parallel load attempts (the old code retried for every
 * single image, which is what made the whole feed look dimmed/blurred).
 */
export async function getNSFWModel(): Promise<any | null> {
  if (modelState === 'ready' && modelPromise) return modelPromise;
  if (modelState === 'loading' && modelPromise) return modelPromise;
  if (modelState === 'off' && Date.now() - lastModelAttempt < MODEL_RETRY_MS) return null;

  modelState = 'loading';
  lastModelAttempt = Date.now();
  modelPromise = (async () => {
    try {
      // @ts-ignore
      const tf = await import('@tensorflow/tfjs');
      // Backend selection (ported from nsfwjs-master): prefer WebGPU, then
      // WebGL, then CPU — whichever the current browser can provide.
      try {
        const preferred = ['webgpu', 'webgl2', 'webgl', 'cpu'];
        for (const b of preferred) {
          try {
            await tf.setBackend(b);
            if (tf.getBackend() === b) break;
          } catch {
            /* backend unavailable, try next */
          }
        }
      } catch (e) {
        console.warn('[NSFW Filter] Backend selection fell back to default:', e);
      }
      // @ts-ignore
      const nsfwjs = await import('nsfwjs');
      const model = await nsfwjs.load(NSFW_MODEL_URL, { size: 224 });
      modelState = 'ready';
      return model;
    } catch (err) {
      console.warn('[NSFW Filter] Model load failed (will retry in 60s):', err);
      modelState = 'off';
      return null;
    }
  })();
  return modelPromise;
}

function safeResult(): NSFWScreenResult {
  return { verdict: 'safe', predictions: [], topClass: 'Neutral', topProbability: 1, engine: 'off' };
}

const CACHE_MAX = 400;
const resultCache = new Map<string, Promise<NSFWScreenResult>>();

// ── Prediction queue (ported from nsfw-filter-master PredictionQueue) ──────
// Limits concurrent model.predict() calls. TF.js runs on a single worker /
// WASM thread, so a burst of feed images all classifying at once would queue
// up dozens of inference jobs and stall the page. We allow 2 at a time.
let activePredictions = 0;
const MAX_CONCURRENT_PREDICTIONS = 2;
const predictionQueue: Array<() => void> = [];

function flushPredictionQueue() {
  while (activePredictions < MAX_CONCURRENT_PREDICTIONS && predictionQueue.length > 0) {
    const run = predictionQueue.shift()!;
    activePredictions++;
    run();
  }
}

function enqueuePrediction<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    predictionQueue.push(() => {
      task().then(resolve, reject).finally(() => {
        activePredictions--;
        flushPredictionQueue();
      });
    });
    flushPredictionQueue();
  });
}

/**
 * Only memoize remote/relative URLs. Data URLs (base64 uploads) are unique per
 * attachment and can be megabytes long — caching them would blow up memory.
 */
function isCacheableSource(src: string): boolean {
  return src.startsWith('http') || src.startsWith('/') || src.startsWith('blob:');
}

/**
 * Classifies a single image source (http(s) URL, data URL, or blob URL).
 * Remote URLs are cached by source string to avoid repeated inference;
 * data URLs are screened fresh each time (they are unique per upload).
 */
export async function screenImageSource(src: string): Promise<NSFWScreenResult> {
  if (!src) {
    return { verdict: 'safe', predictions: [], topClass: 'Neutral', topProbability: 1, engine: 'off' };
  }

  const cacheable = isCacheableSource(src);
  if (cacheable) {
    const cached = resultCache.get(src);
    if (cached) return cached;
  }

  const promise = (async () => {
    const model = await getNSFWModel();
    if (!model) return safeResult();

    // Race classification against a hard timeout so a slow/stuck inference
    // can never leave an image in the dimmed "Checking…" state forever.
    // The timer is cleared as soon as classification settles (no leak).
    let timer: number | undefined;
    const timeout = new Promise<NSFWScreenResult>((resolve) => {
      timer = window.setTimeout(() => resolve(safeResult()), SCREEN_TIMEOUT_MS);
    });

    const classify = (async () => {
      try {
        const img = await loadImageElement(src);
        // Inference runs through the bounded prediction queue so concurrent
        // feed images don't swamp the single-threaded TF.js backend.
        const predictions = await enqueuePrediction<NSFWPrediction[]>(() => model.classify(img, 5));
        const { verdict, topClass, topProbability } = verdictFromPredictions(predictions);
        return { verdict, predictions, topClass, topProbability, engine: 'nsfwjs' } as NSFWScreenResult;
      } catch (err) {
        console.warn('[NSFW Filter] Screening failed for source (allowing):', err);
        return safeResult();
      } finally {
        if (timer) window.clearTimeout(timer);
      }
    })();

    return Promise.race([classify, timeout]);
  })();

  if (cacheable) {
    if (resultCache.size >= CACHE_MAX) resultCache.clear();
    resultCache.set(src, promise);
  }
  return promise;
}

/**
 * Classifies a user-picked File (image) before it is uploaded/published.
 * Used to hard-block NSFW uploads in posts, comments, chat and avatars.
 */
export async function screenImageFile(file: File): Promise<NSFWScreenResult> {
  const dataUrl = await readFileAsDataUrl(file);
  return screenImageSource(dataUrl);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (src.startsWith('http') || src.startsWith('/')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}


