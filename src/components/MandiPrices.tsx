import { useEffect, useState } from 'react';

interface MandiPricesProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Forecast {
  crop: string; market: string; current: number; predicted: number;
  trend: 'up' | 'down' | 'flat'; changePct: number; confidence: number; sampleDays: number;
}
interface PriceRow { id: string; crop: string; market: string; pricePerKg: number; date: string }

export default function MandiPrices({ token, currentUser, onClose }: MandiPricesProps) {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [crops, setCrops] = useState<string[]>([]);
  const [crop, setCrop] = useState('');
  const [market, setMarket] = useState('');
  const [price, setPrice] = useState('');
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/agri/mandi'); setPrices(d.prices || []); setCrops(d.crops || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function record() {
    setMsg('');
    const d = await api('/api/agri/mandi', { method: 'POST', body: JSON.stringify({ crop, market, pricePerKg: Number(price) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Recorded ${d.recorded.crop} at ${d.recorded.pricePerKg} BDT/kg (${d.recorded.market}).`);
    setCrop(''); setPrice('');
    refresh();
  }

  async function predict() {
    setMsg('');
    const d = await api(`/api/agri/predict-price?crop=${encodeURIComponent(crop || 'rice')}&market=${encodeURIComponent(market || 'local')}`);
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setForecast(d.forecast);
  }

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Mandi Price Predictor</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 184 — record wholesale prices, get a 7-day forecast</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input value={crop} onChange={(e) => setCrop(e.target.value)} list="crop-list" placeholder="Crop (rice)" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <datalist id="crop-list">{crops.map((c) => <option key={c} value={c} />)}</datalist>
            <input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Market" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0.01" step="0.01" placeholder="BDT/kg" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={record} className="flex-1 py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Record today's price</button>
            <button onClick={predict} className="flex-1 py-2 rounded-xl bg-amber-700 dark:bg-amber-600 hover:bg-amber-800 text-white text-sm font-bold transition-all">Predict next week</button>
          </div>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        {forecast && (
          <div className={`mb-4 p-4 rounded-2xl border ${forecast.trend === 'up' ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' : forecast.trend === 'down' ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/30' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'}`}>
            <div className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100">{forecast.crop} @ {forecast.market}</div>
            <div className="font-mono text-[11px] text-[#5c5446] dark:text-zinc-300">
              now {forecast.current} → in 7 days <b>{forecast.predicted} BDT/kg</b> ({forecast.changePct > 0 ? '+' : ''}{forecast.changePct}%)
            </div>
            <div className="text-[10px] text-[#8a8172]">Trend: <b>{forecast.trend}</b> · confidence {forecast.confidence}% · {forecast.sampleDays} days of data</div>
          </div>
        )}

        <div className="space-y-1">
          {prices.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No prices recorded yet — add today's mandi rate above.</div>}
          {prices.slice(0, 30).map((p) => (
            <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
              <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-[11px]">🌾</span>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100 capitalize">{p.crop}</span>
                <span className="text-[9px] text-[#8a8172]"> · {p.market}</span>
              </div>
              <span className="font-mono text-[11px] text-[#3a342a] dark:text-zinc-200">{p.pricePerKg} BDT/kg</span>
              <span className="text-[9px] text-[#8a8172]">{p.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
