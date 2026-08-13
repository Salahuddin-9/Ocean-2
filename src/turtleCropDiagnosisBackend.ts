/**
 * Ocean — Crop Disease Scanner (Feature 186)
 * ------------------------------------------
 * Deterministic diagnosis: farmers pick symptoms for a crop; the scanner scores
 * every disease in the knowledge base by symptom overlap and returns the top
 * matches with treatment advice. (A real deployment would swap the symptom
 * picker for a vision model — the scoring layer is shared.)
 *
 * Model: static KB (no db) + db.cropScans history of past diagnoses.
 *
 * Routes:
 *   GET  /api/agri/diseases        (guest) symptom catalog + disease KB
 *   POST /api/agri/diagnose-crop   (auth) { crop, symptoms[] } -> ranked diagnoses
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface CropDisease {
  id: string;
  name: string;
  crop: string;
  symptoms: string[];
  cause: string;
  treatment: string;
}

export const DISEASE_KB: CropDisease[] = [
  { id: 'd1', name: 'Rice Blast', crop: 'rice', symptoms: ['leaf spots', 'leaf lesions', 'rotten neck'], cause: 'Magnaporthe oryzae fungus, spreads in humid weather', treatment: 'Use resistant varieties; apply tricyclazole or isoprothiolane; avoid late-night irrigation that keeps leaves wet.' },
  { id: 'd2', name: 'Bacterial Leaf Blight', crop: 'rice', symptoms: ['leaf yellowing', 'leaf lesions', 'wilting'], cause: 'Xanthomonas oryzae bacteria, enters through wounds', treatment: 'Drain the field; copper-based sprays; use certified disease-free seed.' },
  { id: 'd3', name: 'Late Blight (Potato/Tomato)', crop: 'potato', symptoms: ['leaf spots', 'brown patches', 'leaf yellowing'], cause: 'Phytophthora infestans, explosive in cool wet weather', treatment: 'Remove infected plants; spray mancozeb or metalaxyl; avoid overhead watering.' },
  { id: 'd4', name: 'Powdery Mildew', crop: 'general', symptoms: ['white powder', 'leaf yellowing', 'stunted growth'], cause: 'Erysiphales fungi, thrives in dry days + humid nights', treatment: 'Sulfur or potassium bicarbonate sprays; improve airflow between rows.' },
  { id: 'd5', name: 'Aphid Infestation', crop: 'general', symptoms: ['curling leaves', 'sticky leaves', 'yellowing'], cause: 'Aphid insects sucking sap and spreading viruses', treatment: 'Neem oil or soap spray; introduce ladybugs; wash off with water jet.' },
  { id: 'd6', name: 'Downy Mildew', crop: 'general', symptoms: ['white powder', 'yellow patches', 'leaf spots'], cause: 'Peronosporaceae fungi, favors cool damp conditions', treatment: 'Remove affected leaves; copper fungicide; water at the base, not the leaves.' },
  { id: 'd7', name: 'Root Rot', crop: 'general', symptoms: ['wilting', 'stunted growth', 'yellowing'], cause: 'Overwatering + soil fungi (Pythium/Fusarium)', treatment: 'Reduce watering; improve drainage; treat soil with bio-fungicide (Trichoderma).' },
  { id: 'd8', name: 'Fruit Rot', crop: 'general', symptoms: ['rotten fruit', 'brown patches', 'soft spots'], cause: 'Fungal/bacterial rots from wounds or rain splash', treatment: 'Harvest early; remove rotted fruit; copper or chlorothalonil spray.' },
];

const ALL_SYMPTOMS = [
  'leaf spots', 'leaf lesions', 'rotten neck', 'leaf yellowing', 'wilting',
  'brown patches', 'white powder', 'curling leaves', 'sticky leaves',
  'stunted growth', 'yellow patches', 'rotten fruit', 'soft spots',
];

function uid(): string {
  return `scan-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.cropScans)) db.cropScans = [];
}

export function diagnose(crop: string, symptoms: string[]): { disease: CropDisease; score: number; matched: string[] }[] {
  const norm = symptoms.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  const relevant = DISEASE_KB.filter((d) => d.crop === crop || d.crop === 'general');
  return relevant
    .map((d) => {
      const matched = d.symptoms.filter((s) => norm.includes(s));
      const coverage = matched.length / Math.max(1, d.symptoms.length);
      const specificity = d.crop === crop ? 0.35 : 0;
      const score = Math.min(100, Math.round((coverage * 0.65 + specificity + (matched.length / Math.max(1, norm.length)) * 0.2) * 100));
      return { disease: d, score, matched };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .filter((r) => r.score > 0);
}

export function registerCropDiagnosisRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/agri/diseases', (req, res) => {
    res.json({ diseases: DISEASE_KB, symptoms: ALL_SYMPTOMS });
  });

  app.post('/api/agri/diagnose-crop', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const crop = String(body.crop || 'general').trim().toLowerCase().slice(0, 40);
    const symptoms = Array.isArray(body.symptoms) ? body.symptoms.map(String).slice(0, 10) : [];
    if (symptoms.length === 0) return res.status(400).json({ error: 'Select at least one symptom.' });
    const results = diagnose(crop, symptoms);
    if (results.length === 0) return res.status(404).json({ error: 'No matching disease found — try adding more symptoms.' });
    const db = loadDatabase();
    ensureCollection(db);
    const scan = {
      id: uid(),
      userId: user.id,
      crop,
      symptoms,
      top: results[0].disease.name,
      at: Date.now(),
    };
    (db.cropScans as any[]).unshift(scan);
    saveDatabase(db);
    res.json({ results, scan });
  });
}
