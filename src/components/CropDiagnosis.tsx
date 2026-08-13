import { useEffect, useState } from 'react';

interface CropDiagnosisProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Disease { id: string; name: string; crop: string; symptoms: string[]; cause: string; treatment: string }
interface Result { disease: Disease; score: number; matched: string[] }

export default function CropDiagnosis({ token, currentUser, onClose }: CropDiagnosisProps) {
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [crop, setCrop] = useState('general');
  const [results, setResults] = useState<Result[]>([]);
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  useEffect(() => { /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function diagnose() {
    setMsg('');
    const d = await api('/api/agri/diagnose-crop', { method: 'POST', body: JSON.stringify({ crop, symptoms }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setResults(d.results || []);
  }

  const toggle = (s: string) => setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Crop Disease Scanner</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 186 — describe the symptoms, get a diagnosis + treatment</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-3">
          <div>
            <div className="text-[10px] font-bold text-[#8a8172] mb-1 uppercase tracking-wider">Crop</div>
            <div className="flex flex-wrap gap-1.5">
              {['general', 'rice', 'potato', 'tomato', 'wheat', 'maize'].map((c) => (
                <button key={c} onClick={() => setCrop(c)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all capitalize ${crop === c ? 'bg-emerald-700 border-emerald-700 text-white' : 'border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'}`}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-[#8a8172] mb-1 uppercase tracking-wider">Symptoms (pick all you see)</div>
            <div className="flex flex-wrap gap-1.5">
              {['leaf spots', 'leaf lesions', 'rotten neck', 'leaf yellowing', 'wilting', 'brown patches', 'white powder', 'curling leaves', 'sticky leaves', 'stunted growth', 'yellow patches', 'rotten fruit', 'soft spots'].map((s) => (
                <button key={s} onClick={() => toggle(s)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${symptoms.includes(s) ? 'bg-amber-600 border-amber-600 text-white' : 'border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'}`}>{s}</button>
              ))}
            </div>
          </div>
          <button onClick={diagnose} disabled={symptoms.length === 0} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 disabled:opacity-40 text-white text-sm font-bold transition-all">Scan crop</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        {results.map((r, i) => (
          <div key={r.disease.id} className={`mb-2 p-4 rounded-2xl border ${i === 0 ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900'}`}>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[13px] text-[#3a342a] dark:text-zinc-100">{r.disease.name}</span>
              <span className={`ml-auto font-mono text-[10px] px-2 py-0.5 rounded-full ${r.score >= 60 ? 'bg-emerald-600 text-white' : r.score >= 30 ? 'bg-amber-500 text-white' : 'bg-zinc-400 text-white'}`}>{r.score}% match</span>
            </div>
            <div className="text-[10px] text-[#8a8172] mt-0.5">Matched: {r.matched.join(', ') || '—'}</div>
            <div className="text-[11px] text-[#5c5446] dark:text-zinc-300 mt-1.5"><b>Cause:</b> {r.disease.cause}</div>
            <div className="text-[11px] text-[#5c5446] dark:text-zinc-300 mt-1"><b>Treatment:</b> {r.disease.treatment}</div>
          </div>
        ))}
        {results.length === 0 && !msg && <div className="text-center text-[11px] text-[#8a8172] py-6">Pick symptoms above and scan your crop.</div>}
      </div>
    </div>
  );
}
