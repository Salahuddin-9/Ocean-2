import { useEffect, useState } from 'react';
import { Store, Plus, MapPin, MessageCircle, Tag, Navigation } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Listing {
  id: string;
  sellerId: string;
  sellerName: string;
  kind: 'sell' | 'free' | 'service';
  title: string;
  description: string;
  price: number;
  condition: string;
  location: { label: string; lat: number | null; lng: number | null } | null;
  status: string;
  createdAt: number;
  distanceKm: number | null;
}

const KIND_TABS = [
  { id: 'sell', label: 'Buy / Sell' },
  { id: 'free', label: 'Free' },
  { id: 'service', label: 'Services' },
] as const;

export default function Marketplace({ token, currentUser, onClose }: Props) {
  const [kind, setKind] = useState<'sell' | 'free' | 'service'>('sell');
  const [listings, setListings] = useState<Listing[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locLabel, setLocLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fPrice, setFPrice] = useState('');
  const [fCondition, setFCondition] = useState('good');
  const [fLoc, setFLoc] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (useCoords: { lat: number; lng: number } | null) => {
    const params = new URLSearchParams({ kind });
    if (useCoords) { params.set('lat', String(useCoords.lat)); params.set('lng', String(useCoords.lng)); }
    try {
      const res = await fetch(`/api/marketplace/listings?${params}`);
      if (res.ok) setListings((await res.json()).listings || []);
    } catch { /* offline */ }
  };

  useEffect(() => { load(coords); }, [kind, token]);

  const geolocate = () => {
    if (!navigator.geolocation) { toast('⛔ Geolocation not available — set coords manually'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        setLocLabel(`${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`);
        load(c);
        toast('📍 Nearby listings sorted by distance');
      },
      () => toast('⛔ Location permission denied')
    );
  };

  const createListing = async () => {
    if (!fTitle.trim()) { toast('⛔ Title required'); return; }
    setBusy(true);
    const [lat, lng] = fLoc.includes(',') ? fLoc.split(',').map((x) => Number(x.trim())) : [NaN, NaN];
    const res = await fetch('/api/marketplace/listings', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        kind,
        title: fTitle,
        description: fDesc,
        price: kind === 'free' ? 0 : Number(fPrice) || 0,
        condition: fCondition,
        location: Number.isFinite(lat) && Number.isFinite(lng) ? { label: fLoc, lat, lng } : { label: fLoc },
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      toast('✅ Listing published');
      setShowCreate(false);
      setFTitle(''); setFDesc(''); setFPrice('');
      load(coords);
    } else {
      toast(`⛔ ${data.error || 'Could not create listing'}`);
    }
  };

  const contact = async (listing: Listing) => {
    const res = await fetch(`/api/marketplace/listings/${listing.id}/contact`, { method: 'POST', headers: authHeaders(token) });
    const data = await res.json();
    if (res.ok) {
      window.dispatchEvent(new CustomEvent('open-chat', { detail: { conversationId: data.conversationId } }));
      toast(`💬 Chat opened with ${listing.sellerName} — check your Messages`);
    } else {
      toast(`⛔ ${data.error || 'Could not open chat'}`);
    }
  };

  const markSold = async (listing: Listing) => {
    const res = await fetch(`/api/marketplace/listings/${listing.id}/sold`, { method: 'POST', headers: authHeaders(token) });
    if (res.ok) { toast('✅ Marked as sold'); load(coords); }
  };

  return (
    <FeatureShell title="Hyperlocal Marketplace" badge="9" icon={<Store size={18} className="text-cyan-700 dark:text-cyan-400" />} onClose={onClose}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex gap-1.5">
          {KIND_TABS.map((t) => (
            <button key={t.id} onClick={() => setKind(t.id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${kind === t.id ? 'bg-cyan-800 text-white' : 'bg-white dark:bg-zinc-800 text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={geolocate} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[10px] font-bold uppercase tracking-wider text-[#8a8172] hover:text-cyan-700 transition-all">
            <Navigation size={12} /> {coords ? 'Re-sort by distance' : 'Sort by distance'}
          </button>
          <button onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-800 hover:bg-cyan-700 text-white text-[10px] font-bold uppercase tracking-wider transition-all">
            <Plus size={12} /> {kind === 'free' ? 'List free item' : kind === 'service' ? 'Post service' : 'Sell item'}
          </button>
        </div>
      </div>

      {coords && (
        <p className="text-[9px] font-mono text-cyan-700 dark:text-cyan-400 mb-3">📍 Showing nearest first — {locLabel || `${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`}</p>
      )}

      {showCreate && (
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4 mb-4 space-y-2">
          <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="Title" className="w-full bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-3 py-2 text-xs" />
          <textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} placeholder="Description" className="w-full bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-3 py-2 text-xs resize-none" />
          <div className="flex gap-2">
            {kind !== 'free' && (
              <input value={fPrice} onChange={(e) => setFPrice(e.target.value.replace(/\D/g, ''))} placeholder="Price (৳)" inputMode="numeric" className="w-28 bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-3 py-2 text-xs" />
            )}
            <select value={fCondition} onChange={(e) => setFCondition(e.target.value)} className="bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-2 text-xs">
              {['new', 'like_new', 'good', 'fair'].map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
            <input value={fLoc} onChange={(e) => setFLoc(e.target.value)} placeholder="Location (label or 'lat, lng')" className="flex-1 bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-3 py-2 text-xs" />
          </div>
          <button onClick={createListing} disabled={busy} className="w-full rounded-xl bg-cyan-800 hover:bg-cyan-700 text-white text-[11px] font-bold uppercase tracking-wider py-2 disabled:opacity-40">
            {busy ? 'Publishing…' : 'Publish listing'}
          </button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {listings.length === 0 && (
          <p className="text-[11px] text-[#8a8172] italic col-span-full bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
            No {kind} listings yet — be the first to post one.
          </p>
        )}
        {listings.map((l) => (
          <div key={l.id} className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100 truncate">{l.title}</p>
                <p className="text-[9px] text-[#8a8172] font-mono mt-0.5">{l.sellerName} · {l.condition}</p>
              </div>
              <div className="text-right shrink-0">
                {l.kind === 'free'
                  ? <span className="text-[11px] font-bold text-emerald-600">FREE</span>
                  : <span className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100">৳{l.price.toLocaleString()}</span>}
                {l.distanceKm !== null && <p className="text-[8px] font-mono text-cyan-700 dark:text-cyan-400"><MapPin size={8} className="inline" /> {l.distanceKm} km</p>}
              </div>
            </div>
            {l.description && <p className="text-[10px] text-[#8a8172] mt-1 line-clamp-2">{l.description}</p>}
            <div className="flex items-center gap-2 mt-2">
              {l.sellerId !== currentUser?.id && (
                <button onClick={() => contact(l)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[9px] font-bold uppercase tracking-wider text-[#3a342a] dark:text-zinc-200 hover:border-cyan-500 transition-all">
                  <MessageCircle size={11} /> Chat
                </button>
              )}
              {l.sellerId === currentUser?.id && l.status === 'active' && (
                <button onClick={() => markSold(l)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[9px] font-bold uppercase tracking-wider transition-all">
                  <Tag size={11} /> Mark sold
                </button>
              )}
              {l.sellerId === currentUser?.id && l.status === 'sold' && (
                <span className="text-[9px] font-bold text-emerald-600 uppercase">✓ Sold</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </FeatureShell>
  );
}
