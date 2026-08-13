import { useEffect, useState } from 'react';
import { HeartHandshake, Search, User, ShieldCheck, ShieldX, Clock } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

export default function DigitalLegacy({ token, currentUser, onClose }: Props) {
  const [legacy, setLegacy] = useState<any>(null);
  const [requests, setRequests] = useState<{ pending: any[]; verified: any[] }>({ pending: [], verified: [] });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [threshold, setThreshold] = useState(12);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [legacyRes, reqRes] = await Promise.all([
        fetch('/api/account/legacy', { headers: authHeaders(token) }),
        fetch('/api/account/legacy/requests', { headers: authHeaders(token) }),
      ]);
      if (legacyRes.ok) {
        const data = await legacyRes.json();
        setLegacy(data.legacy);
        setThreshold(data.legacy.inactiveMonths ?? 12);
      }
      if (reqRes.ok) setRequests(await reqRes.json());
    } catch { /* offline */ }
  };

  useEffect(() => { load(); }, [token]);

  useEffect(() => {
    if (!allUsers.length) {
      fetch('/api/creators', { headers: authHeaders(token) })
        .then((r) => r.json())
        .then((data) => setAllUsers(Array.isArray(data) ? data : data?.creators || []))
        .catch(() => {});
    }
  }, [token, allUsers.length]);

  useEffect(() => {
    const term = q.trim().toLowerCase();
    setResults(term ? allUsers.filter((u: any) => (u.name || u.username || '').toLowerCase().includes(term)).slice(0, 6) : []);
  }, [q, allUsers]);

  const save = async () => {
    setBusy(true);
    const res = await fetch('/api/account/legacy', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ inactiveMonths: threshold }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) { toast('✅ Legacy preferences saved'); setLegacy(data.legacy); }
    else toast(`⛔ ${data.error || 'Save failed'}`);
  };

  const setContact = async (u: any) => {
    setBusy(true);
    const res = await fetch('/api/account/legacy', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ legacyContactId: u.id, inactiveMonths: threshold }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      toast(`✅ ${u.name || u.username} is your legacy contact`);
      setLegacy(data.legacy);
      setQ(''); setResults([]);
    } else toast(`⛔ ${data.error || 'Failed'}`);
  };

  const clearContact = async () => {
    setBusy(true);
    const res = await fetch('/api/account/legacy', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ legacyContactId: '', inactiveMonths: threshold }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) { setLegacy(data.legacy); toast('🗑 Legacy contact removed'); }
  };

  const verify = async (ownerUserId: string) => {
    const res = await fetch('/api/account/legacy/contact/verify', {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ ownerUserId }),
    });
    if (res.ok) { toast('✅ Verified — you will manage this memorial'); load(); }
    else toast('⛔ Could not verify');
  };

  const decline = async (ownerUserId: string) => {
    const res = await fetch('/api/account/legacy/contact/decline', {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ ownerUserId }),
    });
    if (res.ok) { toast('Declined'); load(); }
  };

  return (
    <FeatureShell title="Digital Legacy & Memorial" badge="20" icon={<HeartHandshake size={18} className="text-pink-700 dark:text-pink-400" />} onClose={onClose}>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
          <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">My legacy plan</span>

          {legacy?.memorialized ? (
            <div className="mt-3 rounded-xl bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 p-3">
              <p className="text-[11px] font-bold text-pink-700 dark:text-pink-300">🕊 This account is memorialized</p>
              <p className="text-[10px] text-[#8a8172] mt-1">The profile is read-only with a memorial badge. Posts remain visible for friends and family.</p>
            </div>
          ) : (
            <>
              <div className="mt-3 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 p-3">
                <p className="text-[10px] text-[#3a342a] dark:text-zinc-200">
                  <span className="font-bold">{legacy?.legacyContactName || 'No legacy contact set'}</span>
                  {legacy?.legacyContactId && (
                    <span className="ml-2 font-mono text-[8px] text-[#8a8172]">{legacy.legacyContactVerified ? '✓ contact verified' : '· waiting for contact to verify'}</span>
                  )}
                </p>
                {legacy?.legacyContactId && (
                  <button onClick={clearContact} disabled={busy} className="mt-1.5 text-[9px] font-bold text-rose-600 hover:text-rose-500">Remove contact</button>
                )}
              </div>

              <div className="relative mt-2">
                <Search size={12} className="absolute left-2.5 top-2.5 text-[#8a8172]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a legacy contact…"
                  className="w-full bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-pink-500" />
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
                    {results.map((u: any) => (
                      <button key={u.id} onClick={() => setContact(u)}
                        className="w-full text-left px-3 py-2 text-[11px] hover:bg-pink-50 dark:hover:bg-zinc-700 flex items-center gap-2">
                        <User size={12} className="text-pink-600" /> {u.name || u.username}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3">
                <p className="text-[9px] font-mono text-[#8a8172] uppercase tracking-wider flex items-center gap-1"><Clock size={10} /> Memorialize after</p>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {[6, 12, 24].map((m) => (
                    <button key={m} onClick={() => setThreshold(m)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${threshold === m ? 'bg-pink-800 text-white' : 'bg-white dark:bg-zinc-800 text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
                      {m} months
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-pink-800 hover:bg-pink-700 text-white text-[11px] font-bold uppercase tracking-wider py-2 transition-all disabled:opacity-40">
                {busy ? 'Saving…' : 'Save legacy plan'}
              </button>
              <p className="text-[9px] text-[#8a8172] mt-2 leading-relaxed">
                {legacy?.monthsInactive !== null && legacy?.monthsInactive !== undefined
                  ? `Your account has been inactive for ~${legacy.monthsInactive} month(s).`
                  : 'After the threshold passes and your contact confirms, your profile becomes a memorial: posts stay, activity stops.'}
              </p>
            </>
          )}
        </div>

        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
          <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">Requests for me as legacy contact</span>
          <div className="mt-2 space-y-2">
            {requests.pending.length === 0 && (
              <p className="text-[10px] text-[#8a8172] italic">Nobody has named you as their legacy contact yet.</p>
            )}
            {requests.pending.map((u: any) => (
              <div key={u.id} className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl p-3">
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{u.name}</p>
                <p className="text-[9px] text-[#8a8172]">wants you to manage their memorial if they go inactive</p>
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => verify(u.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[9px] font-bold uppercase tracking-wider transition-all">
                    <ShieldCheck size={11} /> Verify
                  </button>
                  <button onClick={() => decline(u.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[9px] font-bold uppercase tracking-wider text-[#8a8172] hover:text-rose-600 transition-all">
                    <ShieldX size={11} /> Decline
                  </button>
                </div>
              </div>
            ))}
            {requests.verified.map((u: any) => (
              <div key={u.id} className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 flex items-center gap-2">
                <ShieldCheck size={13} className="text-emerald-600" />
                <p className="text-[11px] text-[#3a342a] dark:text-zinc-100">{u.name} — you are their verified legacy contact</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </FeatureShell>
  );
}
