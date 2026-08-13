import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileSignature, Plus, Loader2, PenLine } from 'lucide-react';

/**
 * Ocean — Digital Contract Builder (Feature 210)
 * ------------------------------------------------
 * Pick a template, fill in parties & terms, then sign. Contracts are executed
 * when all parties have signed. Backed by /api/contracts.
 */

interface ContractBuilderProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Contract {
  id: string; template: string; title: string; ownerId: string; ownerName: string;
  parties: { id: string; name: string; email?: string }[];
  terms: string; status: string;
  signatures: { partyId: string; name: string; signedAt: number }[];
}

export default function ContractBuilder({ token, currentUser, onClose }: ContractBuilderProps) {
  const [visible, setVisible] = useState(true);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [templates, setTemplates] = useState<{ id: string; title: string }[]>([]);
  const [template, setTemplate] = useState('service');
  const [title, setTitle] = useState('');
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [parties, setParties] = useState<{ id: string; name: string }[]>([]);
  const [terms, setTerms] = useState('');
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, c] = await Promise.all([
        api('/api/contracts/templates', 'GET'),
        currentUser ? api('/api/contracts', 'GET').catch(() => null) : Promise.resolve(null),
      ]);
      setTemplates(t.templates || []);
      setContracts(c?.contracts || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const addParty = () => {
    if (!partyId.trim() || !partyName.trim()) return toast('Party user id and name are required.');
    setParties([...parties, { id: partyId.trim(), name: partyName.trim() }]);
    setPartyId(''); setPartyName('');
  };

  const create = async () => {
    if (parties.length === 0) return toast('Add at least one counterparty.');
    setBusy(true);
    try {
      const d = await api('/api/contracts', 'POST', { template, title, parties, terms });
      toast('Contract created — share it and both sides can sign.');
      setParties([]); setTerms('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const sign = async (id: string) => {
    setBusy(true);
    try {
      const d = await api(`/api/contracts/${id}/sign`, 'POST');
      toast(d.contract.status === 'executed' ? 'Contract fully executed! 🎉' : 'Signed. Waiting on other parties.');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const canSign = (c: Contract) => !c.signatures.some(s => s.partyId === currentUser?.id) &&
    (c.ownerId === currentUser?.id || c.parties.some(p => p.id === currentUser?.id));

  const shell = 'fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Contracts</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-indigo-800/10 dark:bg-indigo-400/10 flex items-center justify-center">
                  <FileSignature className="text-indigo-800 dark:text-indigo-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Contract Builder</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Templates + e-signatures</p>
                </div>
              </div>

              {!currentUser ? (
                <p className="font-mono text-[10px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-400 text-center py-6">Sign in to build contracts.</p>
              ) : loading ? (
                <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                  <Loader2 size={13} className="animate-spin" /> Loading…
                </div>
              ) : (
                <div className="space-y-3">
                  <details className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                    <summary className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 cursor-pointer flex items-center gap-1">
                      <Plus size={11} /> New contract
                    </summary>
                    <div className="mt-2 space-y-2">
                      <select className={input} value={template} onChange={e => setTemplate(e.target.value)}>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                      <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Contract title (optional)" />
                      <div className="grid grid-cols-2 gap-2">
                        <input className={input} value={partyId} onChange={e => setPartyId(e.target.value)} placeholder="Counterparty user id" />
                        <input className={input} value={partyName} onChange={e => setPartyName(e.target.value)} placeholder="Counterparty name" />
                      </div>
                      <button onClick={addParty} className="w-full justify-center flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[10px] font-mono uppercase font-bold text-[#3a342a] dark:text-zinc-100 hover:bg-[#ebdcca]/40">
                        <Plus size={11} /> Add party
                      </button>
                      {parties.map(p => (
                        <div key={p.id} className="text-[10px] text-[#5c5446] dark:text-zinc-300">• {p.name} ({p.id})</div>
                      ))}
                      <textarea className={`${input} resize-none`} rows={3} value={terms} onChange={e => setTerms(e.target.value)} placeholder="Custom terms (leave empty to use the template)" />
                      <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create contract
                      </button>
                    </div>
                  </details>

                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">My contracts ({contracts.length})</div>
                  {contracts.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No contracts yet.</p>}
                  {contracts.map(c => (
                    <div key={c.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{c.title}</span>
                        <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${c.status === 'executed' ? 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-800/10 text-amber-700 dark:text-amber-300'}`}>{c.status}</span>
                      </div>
                      <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 mt-0.5">
                        {c.ownerName} · {c.parties.map(p => p.name).join(', ')} · {c.signatures.length}/{c.parties.length + 1} signed
                      </div>
                      <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-3">{c.terms}</p>
                      {canSign(c) && (
                        <button onClick={() => sign(c.id)} disabled={busy} className={`${btnPrimary} mt-2`}>
                          <PenLine size={11} /> Sign
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
