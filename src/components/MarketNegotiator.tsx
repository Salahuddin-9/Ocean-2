import { useEffect, useState } from 'react';
import { X, Store, Handshake, Plus, Send, PackageSearch } from 'lucide-react';

/**
 * Ocean — AI Marketplace Negotiator (Feature 148)
 * List an item or browse listings; the AI agent suggests an explainable
 * counter-offer based on comparables, demand and your budget.
 */
interface MarketNegotiatorProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface MarketItem {
  id: string;
  sellerName: string;
  title: string;
  category: string;
  condition: string;
  askingPrice: number;
  description: string;
}

interface Negotiation {
  id: string;
  suggestion: number;
  anchor: number;
  rationale: string[];
}

const CATEGORIES = ['electronics', 'furniture', 'clothing', 'books', 'vehicles', 'home', 'other'];

export default function MarketNegotiator({ token, currentUser, onClose }: MarketNegotiatorProps) {
  const [tab, setTab] = useState<'browse' | 'list'>('browse');
  const [items, setItems] = useState<MarketItem[]>([]);
  const [budget, setBudget] = useState('2000');
  const [negotiation, setNegotiation] = useState<{ item: MarketItem; negotiation: Negotiation } | null>(null);
  const [form, setForm] = useState({ title: '', category: 'electronics', condition: 'good', askingPrice: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    try {
      const r = await fetch('/api/market/items');
      const d = await r.json();
      setItems(d.items || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    load();
  }, []);

  const negotiate = async (item: MarketItem) => {
    setBusy(true);
    setError('');
    setSent(false);
    try {
      const r = await fetch('/api/market/negotiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ itemId: item.id, budget: Number(budget) || 0 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Negotiation failed');
      setNegotiation({ item, negotiation: d.negotiation });
    } catch (e: any) {
      setError(e.message || 'Negotiation failed');
    } finally {
      setBusy(false);
    }
  };

  const sendOffer = async (itemId: string, price: number) => {
    setBusy(true);
    try {
      const r = await fetch('/api/market/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ itemId, price }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Offer failed');
      setSent(true);
    } catch (e: any) {
      setError(e.message || 'Offer failed');
    } finally {
      setBusy(false);
    }
  };

  const createItem = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/market/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Listing failed');
      setForm({ title: '', category: 'electronics', condition: 'good', askingPrice: '', description: '' });
      setTab('browse');
      load();
    } catch (e: any) {
      setError(e.message || 'Listing failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Store size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Marketplace Negotiator</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 148</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {(['browse', 'list'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                tab === t
                  ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-950'
                  : 'bg-white/70 dark:bg-zinc-900 text-[#8a8172] dark:text-zinc-400 border border-[#ebdcca] dark:border-zinc-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}

        {tab === 'browse' && (
          <>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
                <Handshake size={12} className="text-amber-600" /> My negotiation budget (BDT)
              </p>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                min={1}
                className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-2">
              {items.length === 0 && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-6 text-center text-[11px] text-[#8a8172] dark:text-zinc-400">
                  <PackageSearch size={20} className="mx-auto mb-2 opacity-60" />
                  No listings yet — list something to start the marketplace.
                </div>
              )}
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100 truncate">{item.title}</p>
                      <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">
                        {item.category} · {item.condition} · by {item.sellerName}
                      </p>
                      {item.description && <p className="text-[10px] text-[#5c5446] dark:text-zinc-400 mt-1 line-clamp-2">{item.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display font-black text-[15px] text-[#3a342a] dark:text-zinc-100">{item.askingPrice}</p>
                      <p className="font-mono text-[8px] text-[#8a8172] dark:text-zinc-500">BDT</p>
                    </div>
                  </div>
                  {negotiation?.item.id === item.id && (
                    <div className="mt-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
                      <p className="flex items-center gap-1.5 font-bold text-[12px] text-amber-800 dark:text-amber-300">
                        <Handshake size={13} /> AI suggests {negotiation.negotiation.suggestion} BDT
                        <span className="ml-auto font-mono text-[8px] font-normal text-[#8a8172]">anchor {negotiation.negotiation.anchor}</span>
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {negotiation.negotiation.rationale.map((r, i) => (
                          <li key={i} className="text-[9px] text-[#5c5446] dark:text-zinc-300 flex gap-1"><span className="text-amber-600">•</span> {r}</li>
                        ))}
                      </ul>
                      <div className="flex gap-1.5 mt-2">
                        <button
                          onClick={() => sendOffer(item.id, negotiation.negotiation.suggestion)}
                          disabled={busy || !currentUser}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 text-[10px] font-bold hover:brightness-110 transition-all disabled:opacity-40"
                        >
                          <Send size={10} /> Offer this
                        </button>
                        {sent && <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 self-center">Offer sent ✓</span>}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => negotiate(item)}
                    disabled={busy}
                    className="mt-2 text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline"
                  >
                    🤝 Ask the negotiator
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'list' && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">New listing</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Title"
                className="col-span-2 px-3 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
              />
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="px-2 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px]">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="px-2 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px]">
                {['new', 'like_new', 'good', 'fair'].map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
              </select>
              <input
                type="number"
                value={form.askingPrice}
                onChange={(e) => setForm({ ...form, askingPrice: e.target.value })}
                placeholder="Asking price (BDT)"
                className="col-span-2 px-3 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px] focus:outline-none focus:border-amber-500"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Description"
                className="col-span-2 px-3 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px] resize-none focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              onClick={createItem}
              disabled={busy || !currentUser}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40"
            >
              <Plus size={13} /> List item
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
