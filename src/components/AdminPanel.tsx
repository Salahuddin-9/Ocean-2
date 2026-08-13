import React, { useCallback, useEffect, useState } from 'react';
import { X, Shield, Flag, Users, Radar, Check, EyeOff, Trash2, Ban, Unlock, RefreshCw } from 'lucide-react';

/**
 * AdminPanel — moderation console (ported from base44-social-media's Admin.jsx).
 * Tabs: Reports / Users / AI Scan.
 * Access is gated server-side by requireAdmin (user.isAdmin flag OR the
 * MASTER_KEY passed as the x-admin-key header).
 */

type Tab = 'reports' | 'users' | 'scan';

interface Report {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  reportsCount: number;
  status: 'open' | 'resolved' | 'hidden';
  createdAt: number;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  trustScore: number;
  followersCount: number;
  blocked: boolean;
  reportsReceived: number;
  createdAt: number;
}

interface ScanItem {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  hits: string[];
  severity: 'low' | 'medium' | 'high';
  createdAt: number;
}

interface AdminPanelProps {
  token: string | null;
  onClose: () => void;
}

const ADMIN_KEY_STORAGE = 'ocean_admin_key';

export const AdminPanel: React.FC<AdminPanelProps> = ({ token, onClose }) => {
  const [tab, setTab] = useState<Tab>('reports');
  const [adminKey, setAdminKey] = useState<string>(() => localStorage.getItem(ADMIN_KEY_STORAGE) || '');
  const [unlocked, setUnlocked] = useState<boolean>(() => !!localStorage.getItem(ADMIN_KEY_STORAGE));
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [scan, setScan] = useState<ScanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [search, setSearch] = useState('');

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (adminKey) h['x-admin-key'] = adminKey;
    return h;
  }, [token, adminKey]);

  const loadReports = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/reports', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      } else if (res.status === 403) {
        setUnlocked(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, headers]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, headers]);

  const runScan = useCallback(async () => {
    if (!token) return;
    setScanning(true);
    try {
      const res = await fetch('/api/admin/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ limit: 200 }),
      });
      if (res.ok) {
        const data = await res.json();
        setScan(data.flagged || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  }, [token, headers]);

  const actOnPost = async (id: string, action: 'hide' | 'remove' | 'clear') => {
    const res = await fetch(`/api/admin/posts/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      setScan((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const toggleBlock = async (id: string, blocked: boolean) => {
    const res = await fetch(`/api/admin/users/${id}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({ blocked }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, blocked } : u)));
    }
  };

  useEffect(() => {
    if (unlocked && token) {
      loadReports();
      loadUsers();
    }
  }, [unlocked, token, loadReports, loadUsers]);

  // Unlock screen — MASTER_KEY from the server env.
  if (!unlocked) {
    return (
      <div className="fixed inset-0 z-[9999] overflow-y-auto p-4 bg-[#0b0a0e]/70 backdrop-blur-sm flex items-center justify-center">
        <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 w-full max-w-sm shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="text-[#8a8172]" size={18} />
              <h3 className="font-display font-bold text-base text-[#3a342a]">Admin Console</h3>
            </div>
            <button onClick={onClose} className="text-[#8a8172] hover:text-[#3a342a] p-1.5 rounded-lg hover:bg-[#ebdcca]/20">
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-[#8a8172]">Enter the admin master key to unlock moderation controls.</p>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => { setAdminKey(e.target.value); setUnlockError(''); }}
            placeholder="Master key"
            className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 text-sm text-[#3a342a]"
          />
          {unlockError && <div className="text-[11px] text-rose-600">{unlockError}</div>}
          <button
            onClick={async () => {
              const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}`, 'x-admin-key': adminKey } });
              if (res.ok) {
                localStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
                setUnlocked(true);
              } else {
                setUnlockError('Invalid master key.');
              }
            }}
            className="w-full py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-xs font-mono uppercase font-bold hover:bg-[#52493b]"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter((u) =>
    !search.trim() || (u.name || '').toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto p-4 bg-[#0b0a0e]/70 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 md:p-6 w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-[#ebdcca]">
          <div className="flex items-center gap-2">
            <Shield className="text-[#8a8172]" size={18} />
            <h3 className="font-display font-bold text-base text-[#3a342a]">Admin Moderation Console</h3>
          </div>
          <button onClick={onClose} className="text-[#8a8172] hover:text-[#3a342a] p-1.5 rounded-lg hover:bg-[#ebdcca]/20">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 my-4">
          {([
            { id: 'reports' as Tab, label: 'Reports', icon: <Flag size={13} /> },
            { id: 'users' as Tab, label: 'Users', icon: <Users size={13} /> },
            { id: 'scan' as Tab, label: 'AI Scan', icon: <Radar size={13} /> },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono uppercase font-bold transition-all ${
                tab === t.id ? 'bg-[#3a342a] text-[#f4f1ea]' : 'bg-[#ebdcca]/40 text-[#8a8172] hover:bg-[#ebdcca]'
              }`}
            >
              {t.icon} {t.label}
              {t.id === 'reports' && reports.length > 0 && (
                <span className="bg-rose-500 text-white rounded-full px-1.5 text-[8px]">{reports.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-[240px] space-y-2">
          {/* REPORTS TAB */}
          {tab === 'reports' && (
            loading ? <LoadingRow /> : reports.length === 0 ? (
              <EmptyRow text="No open reports. All clear! 🎉" />
            ) : (
              reports.map((r) => (
                <div key={r.id} className="bg-white border border-[#ebdcca] rounded-2xl p-3 flex items-start gap-3">
                  {r.imageUrl && <img src={r.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-[#3a342a]">{r.authorName}</span>
                      <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full ${r.status === 'hidden' ? 'bg-zinc-200 text-zinc-600' : 'bg-rose-100 text-rose-600'}`}>
                        {r.status}
                      </span>
                      <span className="text-[9px] font-mono text-[#8a8172]">{r.reportsCount} report{r.reportsCount > 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-[11px] text-[#5c5446] mt-1 line-clamp-2">{r.text || '(no text)'}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => actOnPost(r.id, 'hide')} title="Hide from feed" className="flex items-center gap-1 text-[9px] font-mono uppercase text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-lg"><EyeOff size={11} /> Hide</button>
                    <button onClick={() => actOnPost(r.id, 'remove')} title="Remove post" className="flex items-center gap-1 text-[9px] font-mono uppercase text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg"><Trash2 size={11} /> Remove</button>
                    <button onClick={() => actOnPost(r.id, 'clear')} title="Clear reports" className="flex items-center gap-1 text-[9px] font-mono uppercase text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg"><Check size={11} /> Clear</button>
                  </div>
                </div>
              ))
            )
          )}

          {/* USERS TAB */}
          {tab === 'users' && (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users…"
                className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 text-xs text-[#3a342a]"
              />
              {loading ? <LoadingRow /> : filteredUsers.map((u) => (
                <div key={u.id} className="bg-white border border-[#ebdcca] rounded-2xl p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-[#3a342a] truncate">{u.name}</span>
                      {u.blocked && <span className="text-[9px] font-mono uppercase bg-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded-full">Blocked</span>}
                    </div>
                    <div className="text-[10px] font-mono text-[#8a8172] mt-0.5">
                      Trust {u.trustScore} · {u.followersCount} followers · {u.reportsReceived} reports
                    </div>
                  </div>
                  <button
                    onClick={() => toggleBlock(u.id, !u.blocked)}
                    className={`flex items-center gap-1 text-[9px] font-mono uppercase px-2 py-1.5 rounded-lg whitespace-nowrap ${
                      u.blocked ? 'text-emerald-600 hover:bg-emerald-50' : 'text-rose-600 hover:bg-rose-50'
                    }`}
                  >
                    {u.blocked ? <><Unlock size={11} /> Unblock</> : <><Ban size={11} /> Block</>}
                  </button>
                </div>
              ))}
            </>
          )}

          {/* AI SCAN TAB */}
          {tab === 'scan' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-[#8a8172]">Heuristic keyword scan of recent posts. Flags potential spam/inappropriate content for review.</p>
                <button
                  onClick={runScan}
                  disabled={scanning}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                >
                  <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} /> {scanning ? 'Scanning…' : 'Run Scan'}
                </button>
              </div>
              {scan.length === 0 ? (
                <EmptyRow text="Run a scan to flag suspicious posts." />
              ) : (
                scan.map((s) => (
                  <div key={s.id} className="bg-white border border-[#ebdcca] rounded-2xl p-3 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#3a342a]">{s.authorName}</span>
                        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full ${
                          s.severity === 'high' ? 'bg-rose-100 text-rose-600' : s.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'
                        }`}>{s.severity}</span>
                      </div>
                      <p className="text-[11px] text-[#5c5446] mt-1 line-clamp-2">{s.text || '(no text)'}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {s.hits.map((h) => (
                          <span key={h} className="text-[8px] font-mono uppercase bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded-full">{h}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => actOnPost(s.id, 'hide')} className="flex items-center gap-1 text-[9px] font-mono uppercase text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-lg"><EyeOff size={11} /> Hide</button>
                      <button onClick={() => actOnPost(s.id, 'remove')} className="flex items-center gap-1 text-[9px] font-mono uppercase text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg"><Trash2 size={11} /> Remove</button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const LoadingRow: React.FC = () => (
  <div className="text-center py-10 text-[11px] font-mono uppercase tracking-wider text-[#8a8172]">Loading…</div>
);

const EmptyRow: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-center py-10 text-[11px] font-mono uppercase tracking-wider text-[#8a8172]">{text}</div>
);
