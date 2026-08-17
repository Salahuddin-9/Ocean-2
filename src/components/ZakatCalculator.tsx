import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calculator, Loader2, HandCoins } from 'lucide-react';

/**
 * Ocean — Digital Zakat Calculator (Feature 224)
 * -------------------------------------------------
 * Calculate Zakat (2.5% above nisab) from cash, gold, silver, business assets
 * and savings. Backed by /api/zakat/calculate.
 */

interface ZakatCalculatorProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Result {
  totalWealth: number; nisab: number; eligible: boolean; zakatDue: number;
  breakdown: { label: string; value: number }[];
}

const FIELDS = [
  { key: 'cash', label: 'Cash at hand & bank (BDT)' },
  { key: 'goldValue', label: 'Gold & jewellery value' },
  { key: 'silverValue', label: 'Silver value' },
  { key: 'businessAssets', label: 'Business assets / trade goods' },
  { key: 'savings', label: 'Savings & investments' },
] as const;

export default function ZakatCalculator({ token, currentUser, onClose }: ZakatCalculatorProps) {
  const [visible, setVisible] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [nisab, setNisab] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const toast = (message: string, variant?: string) =>
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));

  const authToken = token || localStorage.getItem('secure_auth_token');
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const calculate = async () => {
    setBusy(true);
    try {
      const body: Record<string, number> = {};
      FIELDS.forEach(f => { body[f.key] = Number(values[f.key]) || 0; });
      if (nisab) body.nisab = Number(nisab);
      const d = await api('/api/zakat/calculate', 'POST', body);
      setResult(d);
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const shell = 'fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Zakat</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
                  <Calculator className="text-amber-800 dark:text-amber-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Zakat Calculator</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">2.5% of wealth above nisab</p>
                </div>
              </div>

              <div className="space-y-2">
                {FIELDS.map(f => (
                  <div key={f.key}>
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">{f.label}</label>
                    <input className={`${input} mt-1`} type="number" min={0} value={values[f.key] || ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })} placeholder="0" />
                  </div>
                ))}
                <input className={input} type="number" min={1} value={nisab} onChange={e => setNisab(e.target.value)} placeholder={`Nisab threshold (default ${'97,978'} BDT silver standard)`} />
                <button onClick={calculate} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                  {busy ? <Loader2 size={11} className="animate-spin" /> : <Calculator size={11} />} Calculate zakat
                </button>
              </div>

              {result && (
                <div className={`rounded-2xl p-4 border ${result.eligible ? 'bg-amber-800/5 border-amber-300/60 dark:border-amber-800/40' : 'bg-white/60 dark:bg-zinc-950/40 border-[#ebdcca] dark:border-zinc-800'}`}>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                    Total wealth <b className="text-[#3a342a] dark:text-zinc-100">{result.totalWealth.toLocaleString()}</b> BDT vs nisab {result.nisab.toLocaleString()}
                  </div>
                  {result.eligible ? (
                    <div className="mt-2 flex items-center gap-2">
                      <HandCoins size={16} className="text-amber-700 dark:text-amber-300" />
                      <div>
                        <div className="font-display text-2xl font-bold text-amber-800 dark:text-amber-300">{result.zakatDue.toLocaleString()} BDT</div>
                        <div className="font-mono text-[9px] uppercase text-[#8a8172]">zakat due this year</div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-2">Wealth is below the nisab threshold — no zakat is due this year.</p>
                  )}
                  <div className="mt-3 space-y-1">
                    {result.breakdown.map(b => (
                      <div key={b.label} className="flex justify-between text-[10px] text-[#8a8172] dark:text-zinc-400">
                        <span>{b.label}</span><span>{b.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
