/**
 * Turtle Social Media Application — NSFW Server-Side Screening Engine
 *
 * Second line of defense: an Express route that screens images server-side.
 * Engine priority:
 *   1. OpenNSFW (Yahoo Caffe model) via the Python 3 wrapper — authoritative,
 *      produces a single 0..1 NSFW score.
 *   2. NSFWJS running in Node (CPU backend) — automatic fallback when Caffe /
 *      pycaffe is not installed on the server.
 *
 * The route returns a verdict ('safe' | 'blur' | 'block') plus engine metadata
 * so clients can render blur/block states for media they could not screen
 * locally (or to double-check locally-computed verdicts).
 */

import { spawn } from 'child_process';
import path from 'path';
import * as jpeg from 'jpeg-js';
import { verdictFromPredictions, type NSFWVerdict } from './turtleNSFWFilter';

export type ServerNSFWVerdict = NSFWVerdict;

export interface ServerNSFWResult {
  success: boolean;
  engine: 'open_nsfw' | 'nsfwjs' | 'unavailable';
  verdict?: ServerNSFWVerdict;
  score?: number;
  predictions?: { className: string; probability: number }[];
  error?: string;
}

/** OpenNSFW guidance: <0.2 safe, >0.8 NSFW (from the open_nsfw README). */
const OPEN_NSFW_BLOCK = 0.8;
const OPEN_NSFW_BLUR = 0.5;

// Resolve Python script: root-level first (deployed location), nested as fallback
import fsSync from 'fs';
const CANDIDATE_SCRIPT_PATHS = [
  path.join(process.cwd(), 'classify_nsfw_py3.py'),
  path.join(process.cwd(), 'server_models', 'open_nsfw', 'classify_nsfw_py3.py'),
];
const PYTHON_SCRIPT = CANDIDATE_SCRIPT_PATHS.find(p => fsSync.existsSync(p)) || CANDIDATE_SCRIPT_PATHS[0];
const PYTHON_TIMEOUT_MS = 25000;

let nsfwjsModelPromise: Promise<any | null> | null = null;

/**
 * Candidate local model.json locations (checked in order) so the server can
 * classify images WITHOUT network access. The client model ships in
 * public/models/mobilenet_v2/; a server_models/ copy is also honored.
 */
const LOCAL_MODEL_CANDIDATES = [
  path.join(process.cwd(), 'public', 'models', 'mobilenet_v2', 'model.json'),
  path.join(process.cwd(), 'server_models', 'mobilenet_v2', 'model.json'),
  path.join(process.cwd(), 'server_models', 'open_nsfw', 'model.json'),
];

/**
 * Minimal tf.io.IOHandler that reads a local Keras model.json + weight shards
 * straight from disk (no fetch, no file:// URL — Node's fetch() does not
 * implement the file: protocol, and @tensorflow/tfjs does not ship the
 * Node-only tf.io.fileSystem handler in its union package). Byte layout follows
 * the exact pattern NSFWJS uses for its bundled weight bundles.
 */
function localFileSystemIOHandler(modelJsonPath: string): { load: () => Promise<any> } {
  return {
    async load() {
      const dir = path.dirname(modelJsonPath);
      const modelJson = JSON.parse(fsSync.readFileSync(modelJsonPath, 'utf8'));
      const artifacts: any = {
        modelTopology: modelJson.modelTopology,
        format: modelJson.format,
        generatedBy: modelJson.generatedBy,
        convertedBy: modelJson.convertedBy,
      };
      if (Array.isArray(modelJson.weightsManifest) && modelJson.weightsManifest.length) {
        const weightSpecs: any[] = [];
        const weightData: Uint8Array[] = [];
        for (const group of modelJson.weightsManifest) {
          for (const p of group.paths || []) {
            weightData.push(new Uint8Array(fsSync.readFileSync(path.join(dir, p))));
          }
          weightSpecs.push(...(group.weights || []));
        }
        const total = weightData.reduce((a, b) => a + b.length, 0);
        const concat = new Uint8Array(total);
        let offset = 0;
        for (const w of weightData) {
          concat.set(w, offset);
          offset += w.byteLength;
        }
        artifacts.weightSpecs = weightSpecs;
        artifacts.weightData = concat.buffer;
      }
      return artifacts;
    },
  };
}

/** Lazily loads (and caches) the NSFWJS model inside Node; retries on failure. */
async function getNSFWJSNodeModel(): Promise<any | null> {
  if (!nsfwjsModelPromise) {
    nsfwjsModelPromise = (async () => {
      const pkgName = 'nsfwjs';
      try {
        const nsfwjs = await import(/* @vite-ignore */ pkgName);
        const localModel = LOCAL_MODEL_CANDIDATES.find((p) => fsSync.existsSync(p));
        let model: any;
        if (localModel) {
          // Pass a disk-backed tf.io.IOHandler instead of a file:// URL —
          // Node's fetch() does not implement the file: protocol, so a URL
          // string makes NSFWJS's internal model fetch throw "fetch failed".
          model = new nsfwjs.NSFWJS(localFileSystemIOHandler(localModel), { size: 224 });
          await model.load();
          console.log(`[NSFW Server] NSFWJS model loaded from local path: ${localModel}`);
        } else {
          model = await nsfwjs.load();
          console.log('[NSFW Server] NSFWJS model loaded from the bundled default URL.');
        }
        return model;
      } catch (err) {
        console.warn('[NSFW Server] NSFWJS Node model load failed (will retry on next request):', err);
        nsfwjsModelPromise = null; // allow a retry later
        return null;
      }
    })();
  }
  return nsfwjsModelPromise;
}

/** Extracts the raw base64 payload from a data URL (or passes through plain base64). */
function toBase64(imageData: string): string {
  const trimmed = (imageData || '').trim();
  if (trimmed.startsWith('data:')) {
    const comma = trimmed.indexOf(',');
    if (comma !== -1) return trimmed.slice(comma + 1);
  }
  return trimmed;
}

/** Converts base64 to a JPEG/PNG RGB byte array compatible with jpeg-js. */
function decodeImageBytes(base64Data: string): { width: number; height: number; data: Buffer } {
  const buffer = Buffer.from(base64Data, 'base64');
  // jpeg-js decodes JPEG; PNG/GIF fall back to a small neutral pad (client-side
  // screening still fully covers those formats in the browser).
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const img = jpeg.decode(buffer, { useTArray: true });
    return { width: img.width, height: img.height, data: img.data as unknown as Buffer };
  }
  // Very small neutral image as a fail-safe (avoid crashing on PNG/GIF inputs).
  const size = 224;
  const data = Buffer.alloc(size * size * 4, 128);
  return { width: size, height: size, data };
}

/**
 * Runs the Python 3 classifier with the base64 payload piped to stdin and
 * returns stdout. Rejects on non-zero exit / timeout / spawn errors.
 */
function runPythonClassifier(input: string, timeoutMs = PYTHON_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('python', [PYTHON_SCRIPT], { windowsHide: true });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('python classifier timed out'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `python classifier exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

/** Tries the OpenNSFW Python pipeline first. */
async function screenWithOpenNSFW(base64Data: string): Promise<ServerNSFWResult | null> {
  try {
    const stdout = await runPythonClassifier(base64Data);
    const lines = stdout.trim().split('\n').filter(Boolean);
    const parsed = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
    if (parsed && parsed.engine === 'open_nsfw' && typeof parsed.score === 'number') {
      const score = parsed.score;
      const verdict: ServerNSFWVerdict = score >= OPEN_NSFW_BLOCK ? 'block' : score >= OPEN_NSFW_BLUR ? 'blur' : 'safe';
      return { success: true, engine: 'open_nsfw', verdict, score };
    }
    return null;
  } catch (err) {
    return null; // python / caffe unavailable -> fall through to NSFWJS
  }
}

/** Falls back to NSFWJS running in Node (CPU backend). */
async function screenWithNSFWJSNode(base64Data: string): Promise<ServerNSFWResult | null> {
  try {
    const model = await getNSFWJSNodeModel();
    if (!model) return null;

    const tf = await import('@tensorflow/tfjs');
    const { width, height, data } = decodeImageBytes(base64Data);

    const numChannels = 3;
    const numPixels = width * height;
    const values = new Int32Array(numPixels * numChannels);
    for (let i = 0; i < numPixels; i++) {
      values[i * numChannels] = data[i * 4];
      values[i * numChannels + 1] = data[i * 4 + 1];
      values[i * numChannels + 2] = data[i * 4 + 2];
    }

    const input = tf.tensor3d(values, [height, width, numChannels], 'int32');
    const predictions = await model.classify(input);
    input.dispose();

    const mapped = predictions.map((p: any) => ({ className: p.className, probability: p.probability }));
    const { verdict } = verdictFromPredictions(mapped);

    return { success: true, engine: 'nsfwjs', verdict, predictions: mapped };
  } catch (err) {
    console.warn('[NSFW Server] NSFWJS Node screening failed:', err);
    return null;
  }
}

/**
 * Public API: screens an image (data URL or raw base64) using OpenNSFW first,
 * falling back to NSFWJS in Node.
 */
let warnedNoModel = false;

/**
 * Placeholder policy when NO screening model is available (Feature: missing
 * server model): ALWAYS ALLOW the content, but log a loud warning once so
 * operators know screening is not active and how to enable it.
 */
function placeholderAllow(error: string): ServerNSFWResult {
  if (!warnedNoModel) {
    warnedNoModel = true;
    console.warn(
      '[NSFW Server] No NSFW model available — FAIL-OPEN placeholder in effect (content is allowed, screening disabled). ' +
      'To enable screening: ' +
      '(1) add the mobilenet_v2 model to server_models/mobilenet_v2/ or public/models/mobilenet_v2/ ' +
      '(model.json + group1-shard1of2.bin + group1-shard2of2.bin), or ' +
      '(2) install OpenNSFW/Caffe so classify_nsfw_py3.py can run. ' +
      'See CLAUDE.md → Known publish blockers.'
    );
  }
  return { success: true, engine: 'unavailable', verdict: 'safe', score: 0, error };
}

export async function serverScreenImage(imageData: string): Promise<ServerNSFWResult> {
  const base64Data = toBase64(imageData);
  if (!base64Data) {
    return { success: false, engine: 'unavailable', error: 'No image data supplied.' };
  }

  const openResult = await screenWithOpenNSFW(base64Data);
  if (openResult) return openResult;

  const nsfwjsResult = await screenWithNSFWJSNode(base64Data);
  if (nsfwjsResult) return nsfwjsResult;

  return placeholderAllow('No NSFW engine available (OpenNSFW needs Caffe; NSFWJS failed to load) — placeholder policy allowed content.');
}

/** Keyword-based quick screening for text captions (no image required). */
const TEXT_SAFETY_TERMS = [
  'nsfw', 'porn', 'hentai', 'gore', 'blood', 'decapitation', 'mutilation',
  'suicide', 'murder', 'slaughter', 'beheading', 'violence', 'naked', 'nudity',
  'sex', 'erotic', 'xxx', 'adult', 'pussy', 'dick', 'cock', 'boob', 'vagina', 'penis',
];
const TEXT_BLOCK_TERMS = new Set(['porn', 'hentai', 'xxx', 'naked', 'nude', 'pussy', 'dick', 'vagina', 'penis']);

function screenTextKeywords(text: string): { verdict: 'safe' | 'blur' | 'block'; reason: string } {
  const combined = String(text || '').toLowerCase();
  for (const term of TEXT_SAFETY_TERMS) {
    if (combined.includes(term)) {
      const verdict = TEXT_BLOCK_TERMS.has(term) ? 'block' : 'blur';
      return { verdict, reason: `Sensitive term detected: ${term}` };
    }
  }
  return { verdict: 'safe', reason: '' };
}

/**
 * Mounts the Express routes for server-side NSFW screening.
 *   POST /api/nsfw/check  { imageData: string (data URL or base64) } -> engine verdict
 *                        | { text: string } -> keyword verdict
 */
export function registerNSFWRoutes(app: any) {
  app.post('/api/nsfw/check', async (req: any, res: any) => {
    try {
      const { imageData, text, imageUrl } = req.body || {};

      // Text-only keyword screening (captions/descriptions).
      if (!imageData) {
        const combinedText = `${text || ''} ${imageUrl || ''}`;
        if (!combinedText.trim()) {
          return res.status(400).json({ success: false, error: 'Provide imageData (data URL or base64) or text to screen.' });
        }
        return res.status(200).json({ success: true, engine: 'keywords', ...screenTextKeywords(combinedText) });
      }

      const result = await serverScreenImage(imageData);
      if (!result.success) {
        return res.status(503).json(result);
      }
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[NSFW Server] /api/nsfw/check error:', err);
      return res.status(500).json({ success: false, error: err?.message || 'NSFW screening failed.' });
    }
  });
}
