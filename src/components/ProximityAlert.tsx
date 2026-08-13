import { useEffect, useState } from 'react';
import { ShieldAlert, Navigation, BellRing, CheckCheck, EyeOff } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Alert {
  id: string;
  blockedName: string;
  distanceM: number;
  at: number;
  acknowledged: boolean;
}

export default function ProximityAlert({ token, currentUser, onClose }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [radius, setRadius] = useState(50);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [checking, setChecking] = useState(false);

  const load = async () => {
    try {
      const [setRes, alertRes] = await Promise.all([
        fetch('/api/safety/proximity/settings', { headers: authHeaders(token) }),
        fetch('/api/safety/proximity/alerts', { headers: authHeaders(token) }),
      ]);
      if (setRes.ok) {
        const s = await setRes.json();
        setEnabled(s.enabled);
        setRadius(s.radiusM);
      }
      if (alertRes.ok) setAlerts((await alertRes.json()).alerts || []);
    } catch { /* offline */ }
  };

  useEffect(() => { load(); }, [token]);

  const saveSettings = async () => {
    const res = await fetch('/api/safety/proximity/settings', {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ enabled, radiusM: radius }),
    });
    const data = await res.json();
    if (res.ok) toast(data.note || '✅ Settings saved');
    else toast(`⛔ ${data.error || 'Save failed'}`);
  };

  const checkNow = async () => {
    if (!navigator.geolocation) { toast('⛔ Geolocation unavailable'); return; }
    setChecking(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await fetch('/api/safety/proximity/check', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        });
        const data = await res.json();
        setChecking(false);
        if (res.ok) {
          if (data.message) toast(data.message);
          load();
        } else {
          toast(`⛔ ${data.error || 'Check failed'}`);
        }
      },
      () => { setChecking(false); toast('⛔ Location permission denied'); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const ack = async (id: string) => {
    await fetch(`/api/safety/proximity/alerts/${id}/ack`, { method: 'POST', headers: authHeaders(token) });
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  };

  return (
    <FeatureShell title="Proximity Alert (Anti-Stalking)" badge="136 · stalk" icon={<EyeOff size={18} className="text-slate-700 dark:text-slate-300" />} onClose={onClose}>
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">Silent proximity alerts</p>
            <p className="text-[9px] text-[#8a8172] mt-0.5">Alerts you silently when a user you blocked is within the radius of your shared location.</p>
          </div>
          <button onClick={() => { setEnabled(!enabled); }} className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-[#8a8172] font-mono uppercase tracking-wider">Radius</span>
          {[50, 100, 200, 500].map((r) => (
            <button key={r} onClick={() => setRadius(r)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${radius === r ? 'bg-slate-800 text-white' : 'bg-white dark:bg-zinc-800 text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
              {r} m
            </button>
          ))}
          <button onClick={saveSettings} className="ml-auto px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold uppercase tracking-wider transition-all">
            Save settings
          </button>
        </div>
        <button onClick={checkNow} disabled={checking}
          className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold uppercase tracking-wider py-2 transition-all disabled:opacity-40">
          <Navigation size={12} /> {checking ? 'Checking…' : 'Check my location now'}
        </button>
        <p className="text-[8px] text-[#8a8172] mt-2">Uses your shared discovery location; you must share a location for the check to work.</p>
      </div>

      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
        <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider flex items-center gap-1"><BellRing size={11} /> Alert history ({alerts.length})</span>
        <div className="mt-2 space-y-1.5">
          {alerts.length === 0 && <p className="text-[10px] text-[#8a8172] italic">No proximity alerts yet — a blocked user has not been detected nearby.</p>}
          {alerts.map((a) => (
            <div key={a.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${a.acknowledged ? 'bg-white/60 dark:bg-zinc-800/60 border-[#ebdcca] dark:border-zinc-700' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
              <ShieldAlert size={14} className={a.acknowledged ? 'text-[#8a8172]' : 'text-amber-600'} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-[#3a342a] dark:text-zinc-100 truncate">
                  {a.blockedName} <span className="text-amber-700 dark:text-amber-300">· {a.distanceM} m</span>
                </p>
                <p className="text-[8px] text-[#8a8172] font-mono">{new Date(a.at).toLocaleString()} · {a.acknowledged ? 'acknowledged' : 'unread — silent alert'}</p>
              </div>
              {!a.acknowledged && (
                <button onClick={() => ack(a.id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[9px] font-bold uppercase tracking-wider text-[#8a8172] hover:text-emerald-600 transition-all">
                  <CheckCheck size={11} /> Acknowledge
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </FeatureShell>
  );
}
