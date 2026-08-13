import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { Map, Navigation, Eye, EyeOff, Send, Users, Flame, Upload, Layers } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import MapboxSnapMap from './MapboxSnapMap';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface NearStory { id: string; userId: string; userName: string; mediaUrl: string; kind: string; lat: number; lng: number; label: string; distanceKm: number | null; at: number; viewed?: boolean }
interface MapLocation { userId: string; lat: number; lng: number; label: string }
interface BestFriend { userId: string; name: string; weight: number }
interface HeatPoint { lat: number; lng: number; intensity: number }

// Bangladesh bounding box (equirectangular projection)
const LAT_MIN = 20.4, LAT_MAX = 26.8, LNG_MIN = 87.9, LNG_MAX = 92.8;
const W = 560, H = 460;

function project(lat: number, lng: number): [number, number] {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H;
  return [x, y];
}

async function api<T>(path: string, token: string | null, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: authHeaders(token), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || 'Request failed');
  return res.json() as Promise<T>;
}

export default function SnapMap({ token, currentUser, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [myLoc, setMyLoc] = useState<MapLocation | null>(null);
  const [stories, setStories] = useState<NearStory[]>([]);
  const [heat, setHeat] = useState<HeatPoint[]>([]);
  const [radius, setRadius] = useState(100);
  const [friends, setFriends] = useState<BestFriend[]>([]);
  const [composing, setComposing] = useState(false);
  const [recipients, setRecipients] = useState('');
  const [caption, setCaption] = useState('');
  const [picked, setPicked] = useState<{ url: string; kind: 'image' | 'video' } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [mapEngine, setMapEngine] = useState<'canvas' | 'mapbox'>('canvas');

  const load = useCallback(async () => {
    try {
      const [loc, st, ht, bf] = await Promise.all([
        api<{ location: MapLocation | null; visible: boolean }>('/api/map/me/location', token),
        api<{ stories: NearStory[] }>(`/api/map/stories?radius=${radius}`, token),
        api<{ heat: HeatPoint[] }>('/api/map/heat', token),
        api<{ bestFriends: BestFriend[] }>('/api/map/best-friends', token),
      ]);
      setVisible(loc.visible); setMyLoc(loc.location); setStories(st.stories); setHeat(ht.heat); setFriends(bf.bestFriends);
    } catch { /* offline */ }
  }, [token, radius]);

  useEffect(() => { load(); }, [load]);

  // draw map
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, W, H);
    // background
    ctx.fillStyle = '#0c1b1e';
    ctx.fillRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath(); ctx.moveTo((W / 10) * i, 0); ctx.lineTo((W / 10) * i, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (H / 8) * i); ctx.lineTo(W, (H / 8) * i); ctx.stroke();
    }
    // rough Bangladesh silhouette (simplified polygon)
    ctx.beginPath();
    const bdPoly: [number, number][] = [
      [88.9, 26.6], [89.5, 26.2], [90.4, 26.3], [91.1, 26.0], [91.9, 25.9], [92.5, 25.2], [92.7, 24.6],
      [92.3, 23.9], [92.0, 23.2], [91.9, 22.4], [91.4, 21.8], [91.1, 21.1], [90.7, 20.7], [90.0, 20.6],
      [89.3, 20.9], [88.6, 21.4], [88.0, 21.8], [88.1, 22.6], [88.2, 23.3], [88.4, 24.0], [88.0, 24.7],
      [88.3, 25.2], [88.5, 26.0], [88.9, 26.6],
    ];
    ctx.moveTo(...project(bdPoly[0][1], bdPoly[0][0]));
    for (const [lng, lat] of bdPoly.slice(1)) ctx.lineTo(...project(lat, lng));
    ctx.closePath();
    ctx.fillStyle = 'rgba(52,94,90,0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(94,234,212,0.25)';
    ctx.stroke();

    // heat
    for (const hp of heat) {
      const [x, y] = project(hp.lat, hp.lng);
      const r = 8 + hp.intensity * 26;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(244,114,182,${0.35 + hp.intensity * 0.4})`);
      grad.addColorStop(1, 'rgba(244,114,182,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // story dots
    for (const s of stories) {
      const [x, y] = project(s.lat, s.lng);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = s.viewed ? 'rgba(148,163,184,0.7)' : '#fb7185';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // me
    if (myLoc) {
      const [x, y] = project(myLoc.lat, myLoc.lng);
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8'; ctx.fill();
      ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(56,189,248,0.3)';
      ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0f2fe'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('You', x, y - 14);
    }
  }, [stories, heat, myLoc]);

  const toggleShare = () => {
    if (visible) {
      api('/api/map/me/location', token, { visible: false }, 'POST').then(() => { setVisible(false); setMyLoc(null); toast('🕶️ Location hidden'); }).catch(() => {});
      return;
    }
    if (!navigator.geolocation) { toast('⛔ Geolocation unavailable'); return; }
    setSharing(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const label = `${currentUser?.name || 'Me'} (${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)})`;
        try {
          const d = await api<{ location: MapLocation }>('/api/map/me/location', token, { lat: pos.coords.latitude, lng: pos.coords.longitude, label });
          setMyLoc(d.location); setVisible(true);
          toast('📍 Location shared — only story heat & nearby dots are visible to others');
        } catch (e: any) { toast(`⛔ ${e.message}`); }
        setSharing(false);
      },
      () => { setSharing(false); toast('⛔ Location permission denied'); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f, `snap-${Date.now()}.${f.type.includes('video') ? 'mp4' : 'jpg'}`);
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const d = await res.json();
    if (!res.ok || !d.url) return toast(`⛔ ${d.error || 'Upload failed'}`);
    setPicked({ url: d.url, kind: d.kind === 'video' ? 'video' : 'image' });
  };

  const sendPrivate = async () => {
    const ids = recipients.split(',').map((s) => s.trim()).filter(Boolean);
    if (!picked) return toast('⛔ Pick a photo/video first');
    if (!ids.length) return toast('⛔ Add at least one recipient id');
    try {
      const d = await api<{ note: string }>('/api/stories/private', token, { mediaUrl: picked.url, kind: picked.kind, caption, recipientIds: ids });
      toast(`✅ ${d.note}`);
      setPicked(null); setCaption(''); setRecipients(''); setComposing(false);
    } catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  return (
    <FeatureShell title="Ocean Map + Snap" badge="258 · snapchat-style" icon={<Map size={18} className="text-pink-700 dark:text-pink-400" />} onClose={onClose}>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-[9px] text-[#8a8172] font-bold">Radius</span>
        {[25, 50, 100, 200].map((r) => (
          <button key={r} onClick={() => setRadius(r)} className={`rounded-lg px-2 py-1 text-[9px] font-bold transition-all ${radius === r ? 'bg-pink-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>{r} km</button>
        ))}
        <button onClick={() => setMapEngine(mapEngine === 'canvas' ? 'mapbox' : 'canvas')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${mapEngine === 'mapbox' ? 'bg-pink-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
          <Layers size={11} /> {mapEngine === 'mapbox' ? 'Mapbox GL' : 'Canvas'}
        </button>
        <button onClick={toggleShare} disabled={sharing}
          className={`ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${visible ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-white'}`}>
          {visible ? <Eye size={11} /> : <EyeOff size={11} />} {sharing ? 'Locating…' : visible ? 'Sharing' : 'Share location'}
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-2 space-y-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            {mapEngine === 'mapbox' ? (
              <MapboxSnapMap stories={stories} heat={heat} myLoc={myLoc} />
            ) : (
              <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-xl" />
            )}
            <p className="text-[8px] text-[#8a8172] mt-1.5">Heat dots = public stories with shared locations. Pink = unseen, gray = seen, blue = you. Sharing is 100% opt-in.</p>
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172]">Nearby public stories ({stories.length})</p>
              <button onClick={() => setComposing(!composing)} className="flex items-center gap-1 rounded-lg bg-pink-600 hover:bg-pink-500 text-white px-2.5 py-1 text-[9px] font-bold">
                <Send size={10} /> Private story
              </button>
            </div>
            {composing && (
              <div className="rounded-xl bg-pink-50 dark:bg-pink-900/10 border border-pink-200 dark:border-pink-800 p-2.5 mb-2">
                <label className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-pink-300 dark:border-pink-700 py-2 text-[10px] font-bold text-pink-600 dark:text-pink-300 cursor-pointer">
                  <Upload size={12} /> {picked ? '✓ Media ready' : 'Pick photo / video'}
                  <input type="file" accept="image/*,video/*" className="hidden" onChange={pickFile} />
                </label>
                {picked?.url && (picked.kind === 'video'
                  ? <video src={picked.url} className="mt-2 w-full max-h-40 rounded-lg" controls />
                  : <img src={picked.url} className="mt-2 w-full max-h-40 rounded-lg object-cover" alt="pick" />)}
                <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="Recipient user ids (comma separated)" className="mt-2 w-full rounded-lg border border-pink-200 dark:border-pink-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[10px] outline-none" />
                <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" className="mt-1.5 w-full rounded-lg border border-pink-200 dark:border-pink-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[10px] outline-none" />
                <button onClick={sendPrivate} className="mt-2 w-full rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-[10px] font-bold py-2">Send privately (24h)</button>
              </div>
            )}
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {stories.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-2">
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-black shrink-0">
                    {s.kind === 'video' ? <video src={s.mediaUrl} className="w-full h-full object-cover" muted playsInline /> : <img src={s.mediaUrl} className="w-full h-full object-cover" alt="" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-[#3a342a] dark:text-zinc-100 truncate">{s.userName} {s.label && `· ${s.label}`}</p>
                    <p className="text-[8px] text-[#8a8172]">{s.distanceKm === null ? 'distance unknown' : `${s.distanceKm} km away`} · {new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  {!s.viewed && <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse shrink-0" />}
                </div>
              ))}
              {stories.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No public stories with shared locations within {radius} km.</p>}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Flame size={11} /> Best friends</p>
            {friends.map((f, i) => (
              <div key={f.userId} className="flex items-center gap-2 py-1.5 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${i === 0 ? 'bg-pink-500 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>{i + 1}</span>
                <span className="text-[11px] font-semibold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{f.name}</span>
                <span className="text-[8px] font-mono text-pink-500">{f.weight} pts</span>
              </div>
            ))}
            {friends.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No best friends yet — view & react to stories to build the graph.</p>}
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Users size={11} /> Quick recipients</p>
            <div className="flex gap-1 flex-wrap">
              {friends.slice(0, 6).map((f) => (
                <button key={f.userId} onClick={() => setRecipients((r) => (r ? `${r}, ${f.userId}` : f.userId))}
                  className="rounded-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2 py-1 text-[9px] font-bold text-[#8a8172] hover:border-pink-400 transition-all">
                  {f.name}
                </button>
              ))}
              {friends.length === 0 && <p className="text-[9px] text-[#8a8172] italic">Best friends appear here for quick private-story targets.</p>}
            </div>
          </div>
        </div>
      </div>
    </FeatureShell>
  );
}
