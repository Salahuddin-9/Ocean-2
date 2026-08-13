import { useEffect, useState } from 'react';
import type * as React from 'react';
import { ScanFace, Upload, Search, ShieldCheck, Trash2 } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Match {
  id: string;
  reportId: string;
  personName: string;
  reporterName: string;
  areaLabel: string;
  status: string;
  volunteerName: string;
  imageUrl: string;
  similarity: number;
}

const pct = (s: number) => `${Math.round(s * 100)}%`;

export default function MissingFaceSearch({ token, currentUser, onClose }: Props) {
  const [mode, setMode] = useState<'search' | 'index'>('search');
  const [reports, setReports] = useState<any[]>([]);
  const [reportId, setReportId] = useState('');
  const [queryImg, setQueryImg] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [indexed, setIndexed] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<Match[]>([]);

  const load = async () => {
    try {
      const [idxRes, repRes] = await Promise.all([
        fetch('/api/missing/face-index', { headers: authHeaders(token) }),
        fetch('/api/missing/reports?status=active', { headers: authHeaders(token) }),
      ]);
      if (idxRes.ok) setIndexed((await idxRes.json()).indexed || 0);
      if (repRes.ok) {
        const data = await repRes.json();
        const list = Array.isArray(data) ? data : data.reports || [];
        setReports(list.filter((r: any) => r.status !== 'found_safe' && r.status !== 'withdrawn'));
        if (list[0]) setReportId(list[0].id);
      }
    } catch { /* offline */ }
  };

  useEffect(() => { load(); }, [token]);

  /** Resize any image to a small JPEG data URL (canvas → JPEG keeps jpeg-js happy). */
  const toJpeg = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 256 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.max(8, Math.round(img.width * scale));
          c.height = Math.max(8, Math.round(img.height * scale));
          const ctx = c.getContext('2d');
          if (!ctx) return reject(new Error('Canvas unavailable'));
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => reject(new Error('Could not read image'));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const jpeg = await toJpeg(file);
      setQueryImg(jpeg);
      toast('📷 Image ready — run the action below');
    } catch (err: any) {
      toast(`⛔ ${err?.message || 'Could not read image'}`);
    }
  };

  const runSearch = async () => {
    if (!queryImg) return toast('⛔ Choose a photo first');
    setBusy(true);
    const res = await fetch('/api/missing/face-search', {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ imageData: queryImg }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setMatches(data.matches || []);
      toast(data.matches?.length ? `🔎 ${data.matches.length} visual match(es) found` : 'No close matches in the volunteer index');
    } else {
      toast(`⛔ ${data.error || 'Search failed'}`);
    }
  };

  const runIndex = async () => {
    if (!queryImg) return toast('⛔ Choose a photo first');
    if (!reportId) return toast('⛔ Pick the missing-person report this photo belongs to');
    setBusy(true);
    const res = await fetch('/api/missing/face-upload', {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ reportId, imageData: queryImg }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      toast('✅ Indexed (perceptual hash only)');
      load();
    } else {
      toast(`⛔ ${data.error || 'Upload failed'}`);
    }
  };

  return (
    <FeatureShell title="Missing Person — Visual Match" badge="130 · face" icon={<ScanFace size={18} className="text-rose-700 dark:text-rose-400" />} onClose={onClose}>
      <p className="text-[10px] text-[#8a8172] mb-3 leading-relaxed">
        Privacy-preserving matching: only photos uploaded by relief-camp volunteers are indexed, as perceptual hashes — your search photo is never stored, and nothing is sent to a cloud service.
      </p>

      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1.5">
            {(['search', 'index'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${mode === m ? 'bg-rose-800 text-white' : 'bg-white dark:bg-zinc-800 text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
                {m === 'search' ? '🔎 Find a match' : '📥 Index volunteer photo'}
              </button>
            ))}
          </div>
          <span className="font-mono text-[9px] text-[#8a8172] ml-auto">{indexed} photo(s) indexed</span>
        </div>

        <div className="mt-3 flex gap-3 items-start">
          <label className="shrink-0 w-36 h-28 rounded-xl border-2 border-dashed border-[#cfcac0] dark:border-zinc-700 flex flex-col items-center justify-center cursor-pointer hover:border-rose-400 transition-all bg-white dark:bg-zinc-800">
            {queryImg ? <img src={queryImg} alt="query" className="w-full h-full object-cover rounded-lg" /> : <><Upload size={16} className="text-[#8a8172]" /><span className="text-[8px] text-[#8a8172] mt-1">Upload photo</span></>}
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
          </label>
          <div className="flex-1 space-y-2">
            {mode === 'index' && (
              <select value={reportId} onChange={(e) => setReportId(e.target.value)} className="w-full bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-3 py-2 text-xs">
                {reports.map((r) => <option key={r.id} value={r.id}>{r.personName} — {r.areaLabel}</option>)}
                {reports.length === 0 && <option value="">No active reports (create one in Missing Person)</option>}
              </select>
            )}
            <button onClick={mode === 'search' ? runSearch : runIndex} disabled={busy || !queryImg}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-rose-800 hover:bg-rose-700 text-white text-[11px] font-bold uppercase tracking-wider py-2 transition-all disabled:opacity-40">
              {mode === 'search' ? <><Search size={12} /> {busy ? 'Matching…' : 'Search volunteer index'}</> : <><Upload size={12} /> {busy ? 'Indexing…' : 'Index this photo'}</>}
            </button>
          </div>
        </div>
      </div>

      {matches.length > 0 && (
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
          <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">Top visual matches</span>
          <div className="mt-2 grid sm:grid-cols-2 gap-2">
            {matches.map((m) => (
              <div key={m.id} className="flex gap-2 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl p-2">
                {m.imageUrl && m.imageUrl.startsWith('data:') && <img src={m.imageUrl} alt={m.personName} className="w-14 h-14 rounded-lg object-cover" />}
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 truncate">{m.personName}</p>
                  <p className="text-[9px] text-[#8a8172] truncate">{m.areaLabel} · {m.status}</p>
                  <p className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">Similarity {pct(m.similarity)}</p>
                  <p className="text-[8px] text-[#8a8172]">Report #{m.reportId}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {matches.length === 0 && queryImg && !busy && mode === 'search' && (
        <p className="text-[11px] text-[#8a8172] italic bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
          No close matches (≥55% similarity). Try a clearer frontal photo, or have camp volunteers index photos of the missing person.
        </p>
      )}
    </FeatureShell>
  );
}
