/**
 * Ocean — Missing Person Visual/Facial Match (Feature 130)
 * ----------------------------------------------------------
 * Privacy-preserving face matching for disaster relief: ONLY images uploaded by
 * relief-camp volunteers are indexed (as perceptual hashes — raw pixels of the
 * search query are never stored and nothing leaves the server). A search image is
 * hashed with a 16×16 perceptual hash (jpeg-js decode → grayscale average hash)
 * and compared by Hamming distance; matches reference the original Missing Report.
 *
 * Model (global db): db.faceIndex — array of
 *   { id, reportId, volunteerId, volunteerName, imageUrl, hash, at }
 *
 * Routes:
 *   POST /api/missing/face-upload           (auth) { reportId, imageData } index a volunteer photo
 *   POST /api/missing/face-search           (auth) { imageData } -> top matches + report refs
 *   GET  /api/missing/face-index            (auth) index stats
 *   POST /api/missing/face-upload/:id/remove (auth: uploader) de-index
 */
import express from 'express';
import { decode } from 'jpeg-js';
import { getCtx } from './turtleServerContext';

interface FaceEntry {
  id: string;
  reportId: string;
  volunteerId: string;
  volunteerName: string;
  imageUrl: string;
  hash: string; // 64 hex chars (256-bit perceptual hash)
  at: number;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const SIMILARITY_THRESHOLD = 0.55;
const MAX_INDEX_PER_USER = 50;

function uid(): string {
  return `face-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureIndex(db: any): FaceEntry[] {
  if (!Array.isArray(db.faceIndex)) db.faceIndex = [];
  return db.faceIndex as FaceEntry[];
}

/** Extract raw image bytes from a data-URL or raw base64 string. */
function extractBuffer(data: string): Buffer | null {
  const str = String(data || '');
  const m = str.match(/^data:image\/[a-z+]+;base64,(.+)$/);
  const b64 = m ? m[1] : str;
  if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
  const buf = Buffer.from(b64, 'base64');
  return buf.length > 0 && buf.length <= MAX_IMAGE_BYTES ? buf : null;
}

/** Downsample a decoded JPEG to a 16×16 grayscale grid. */
function toGray16(data: Buffer, width: number, height: number): number[] {
  const grid: number[] = [];
  for (let gy = 0; gy < 16; gy++) {
    const y0 = Math.floor((gy * height) / 16);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / 16));
    for (let gx = 0; gx < 16; gx++) {
      const x0 = Math.floor((gx * width) / 16);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / 16));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * width + xx) * 4;
          sum += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
          n++;
        }
      }
      grid.push(n ? sum / n : 0);
    }
  }
  return grid;
}

/** Perceptual hash (256-bit average hash) of a JPEG buffer. */
function phash(imageData: Buffer): string {
  const jpg = decode(imageData, { useTArray: true, maxMemoryUsageInMB: 256 });
  if (jpg.width < 8 || jpg.height < 8) throw new Error('Image too small to hash.');
  const gray = toGray16(jpg.data as Buffer, jpg.width, jpg.height);
  const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
  let hash = '';
  for (let i = 0; i < gray.length; i += 4) {
    let nib = 0;
    for (let b = 0; b < 4; b++) nib = (nib << 1) | (gray[i + b] >= avg ? 1 : 0);
    hash += nib.toString(16);
  }
  return hash;
}

function hamming(a: string, b: string): number {
  let d = BigInt('0x' + a) ^ BigInt('0x' + b);
  let count = 0;
  while (d) {
    count += Number(d & 1n);
    d >>= 1n;
  }
  return count;
}

function similarity(a: string, b: string): number {
  return 1 - hamming(a, b) / 256;
}

export function registerMissingFaceSearchRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  function safeHash(input: string): string | null {
    try {
      const buf = extractBuffer(input);
      if (!buf) return null;
      return phash(buf);
    } catch {
      return null;
    }
  }

  // POST /api/missing/face-upload — index a volunteer photo against a report (auth)
  app.post('/api/missing/face-upload', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const reportId = String(body.reportId || '');
    const imageData = String(body.imageData || '');
    const db = loadDatabase();
    const index = ensureIndex(db);
    const myCount = index.filter((e) => e.volunteerId === me.id).length;
    if (myCount >= MAX_INDEX_PER_USER) {
      return res.status(429).json({ error: 'Volunteer upload limit reached (50).' });
    }
    const report = ((db.missingPerson?.reports) || []).find((r: any) => r && r.id === reportId);
    if (!reportId || !report) {
      return res.status(400).json({ error: 'Link this photo to an existing missing-person reportId.' });
    }
    const hash = safeHash(imageData);
    if (!hash) {
      return res.status(422).json({ error: 'Could not hash the image — upload a clear JPEG photo.' });
    }
    const entry: FaceEntry = {
      id: uid(),
      reportId,
      volunteerId: me.id,
      volunteerName: me.name || me.username || 'Volunteer',
      imageUrl: String(imageData).slice(0, 400_000),
      hash,
      at: Date.now(),
    };
    index.push(entry);
    saveDatabase(db);
    res.json({
      success: true,
      entry: { id: entry.id, reportId: entry.reportId, at: entry.at },
      note: 'Stored as a perceptual hash only — the source pixels are not indexed for matching.',
    });
  });

  // POST /api/missing/face-search — compare a photo against the volunteer index (auth)
  app.post('/api/missing/face-search', requireAuth, (req, res) => {
    const db = loadDatabase();
    const index = ensureIndex(db);
    const hash = safeHash(String((req.body || {}).imageData || ''));
    if (!hash) {
      return res.status(422).json({ error: 'Could not hash the search image — upload a clear JPEG photo.' });
    }
    const matches = index
      .map((e) => {
        const report = ((db.missingPerson?.reports) || []).find((r: any) => r && r.id === e.reportId);
        return {
          id: e.id,
          reportId: e.reportId,
          personName: report?.personName || 'Missing person',
          reporterName: report?.reporterName || '',
          areaLabel: report?.areaLabel || '',
          status: report?.status || 'active',
          volunteerName: e.volunteerName,
          imageUrl: e.imageUrl,
          similarity: similarity(hash, e.hash),
          indexedAt: e.at,
        };
      })
      .filter((m) => m.similarity >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
    res.json({ matches, threshold: SIMILARITY_THRESHOLD, indexed: index.length });
  });

  // GET /api/missing/face-index — stats (auth)
  app.get('/api/missing/face-index', requireAuth, (req, res) => {
    const db = loadDatabase();
    const index = ensureIndex(db);
    const byReport: Record<string, number> = {};
    for (const e of index) byReport[e.reportId] = (byReport[e.reportId] || 0) + 1;
    res.json({ indexed: index.length, byReport });
  });

  // POST /api/missing/face-upload/:id/remove — uploader removes their own entry (auth)
  app.post('/api/missing/face-upload/:id/remove', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const index = ensureIndex(db);
    const idx = index.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found.' });
    if (index[idx].volunteerId !== me.id) {
      return res.status(403).json({ error: 'Only the uploading volunteer can remove this entry.' });
    }
    index.splice(idx, 1);
    saveDatabase(db);
    res.json({ success: true });
  });
}
