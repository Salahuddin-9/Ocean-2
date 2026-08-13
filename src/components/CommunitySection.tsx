import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays, MapPin, Users, MessageCircleQuestion, Hash, Sparkles, Coins,
  Plus, Send, CheckCircle2, ArrowUp, Trophy, Music2, Heart, BarChart3,
} from 'lucide-react';
import SmartCommunity from './SmartCommunity';

/**
 * CommunitySection — Events / Questions / Topics / Creator Studio / Rewards.
 * Feature set ported from base44-social-media + arena-ai. All data comes from
 * the server community backend (/api/community/*).
 */

interface CommunityEvent { id: string; title: string; description: string; category: string; location: string; date: number; capacity: number; createdBy: string; createdAt: number; attendees: string[] }
interface CommunityQuestion { id: string; text: string; category: string; askedBy: string; askedAt: number; answers: { id: string; text: string; by: string; at: number; upvotes: string[] }[] }
interface CommunityTopic { id: string; name: string; emoji: string; description: string; members: string[] }
interface CommunityState { events: CommunityEvent[]; questions: CommunityQuestion[]; topics: CommunityTopic[]; tips: unknown[]; balances: Record<string, number> }
interface RewardDef { id: string; name: string; description: string; cost: number; emoji: string }

interface CommunitySectionProps {
  token?: string | null;
  currentUser: { id: string; name: string; avatarUrl?: string } | null;
  creatorsList?: any[];
  stats?: { posts: number; reels: number; followers: number; likes: number; comments: number };
}

type Tab = 'events' | 'questions' | 'topics' | 'studio' | 'rewards' | 'smart';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'events', label: 'Events', icon: <CalendarDays size={13} /> },
  { id: 'questions', label: 'Q&A', icon: <MessageCircleQuestion size={13} /> },
  { id: 'topics', label: 'Topics', icon: <Hash size={13} /> },
  { id: 'studio', label: 'Studio', icon: <BarChart3 size={13} /> },
  { id: 'rewards', label: 'Rewards', icon: <Trophy size={13} /> },
  { id: 'smart', label: 'Smart', icon: <Sparkles size={13} /> },
];

const inputCls = 'w-full bg-[#fbf9f4] border-2 border-[#ebdcca] focus:border-[#cfcac0] rounded-xl px-3 py-2 text-xs text-[#3a342a] placeholder-[#8a8172]/60 outline-none';
const cardCls = 'bg-white border border-[#ebdcca] rounded-2xl p-4 space-y-2';

export default function CommunitySection({ token, currentUser, creatorsList, stats }: CommunitySectionProps) {
  const [tab, setTab] = useState<Tab>('events');
  const [state, setState] = useState<CommunityState | null>(null);
  const [rewards, setRewards] = useState<RewardDef[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // Forms
  const [evTitle, setEvTitle] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [evLoc, setEvLoc] = useState('');
  const [evDate, setEvDate] = useState('');
  const [qText, setQText] = useState('');
  const [answerText, setAnswerText] = useState<Record<string, string>>({});
  const [tipAmount, setTipAmount] = useState(5);
  const [tipNote, setTipNote] = useState('');
  const [tipTo, setTipTo] = useState('');

  const api = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    });
    return res.json();
  }, [token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await api('/api/community');
    if (data?.state) setState(data.state);
    if (data?.rewards) setRewards(data.rewards);
    try {
      const rw = await api('/api/community/rewards');
      if (rw?.balance !== undefined) setBalance(rw.balance);
    } catch { /* ignore */ }
    setLoading(false);
  }, [api]);

  useEffect(() => { refresh(); }, [refresh]);

  const createEvent = async () => {
    if (!evTitle.trim()) return;
    const body: any = { title: evTitle.trim(), description: evDesc.trim(), location: evLoc.trim() || 'Online' };
    if (evDate) body.date = new Date(evDate).getTime();
    await api('/api/community/events', { method: 'POST', body: JSON.stringify(body) });
    setEvTitle(''); setEvDesc(''); setEvLoc(''); setEvDate('');
    refresh();
  };

  const rsvp = async (id: string) => {
    await api(`/api/community/events/${id}/rsvp`, { method: 'POST', body: JSON.stringify({}) });
    refresh();
  };

  const askQuestion = async () => {
    if (!qText.trim()) return;
    await api('/api/community/questions', { method: 'POST', body: JSON.stringify({ text: qText.trim() }) });
    setQText('');
    refresh();
  };

  const answer = async (questionId: string) => {
    const text = (answerText[questionId] || '').trim();
    if (!text) return;
    await api(`/api/community/questions/${questionId}/answers`, { method: 'POST', body: JSON.stringify({ text }) });
    setAnswerText((m) => ({ ...m, [questionId]: '' }));
    refresh();
  };

  const upvote = async (questionId: string, answerId: string) => {
    await api('/api/community/answers/upvote', { method: 'POST', body: JSON.stringify({ questionId, answerId }) });
    refresh();
  };

  const join = async (topicId: string) => {
    await api(`/api/community/topics/${topicId}/join`, { method: 'POST', body: JSON.stringify({}) });
    refresh();
  };

  const tip = async (to: string) => {
    if (!to) return;
    await api('/api/community/tips', { method: 'POST', body: JSON.stringify({ to, amount: tipAmount, note: tipNote.trim() || undefined }) });
    setTipNote('');
    refresh();
  };

  const redeem = async (rewardId: string) => {
    const r = await api(`/api/community/rewards/${rewardId}/redeem`, { method: 'POST', body: JSON.stringify({}) });
    if (r?.error) alert(r.error);
    if (r?.balance !== undefined) setBalance(r.balance);
    refresh();
  };

  const myId = currentUser?.id;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold px-3 py-2 rounded-xl border transition-colors whitespace-nowrap ${
              tab === t.id ? 'bg-[#3a342a] text-[#f4f1ea] border-[#3a342a]' : 'bg-white text-[#8a8172] border-[#ebdcca] hover:border-[#cfcac0]'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-10 text-[10px] font-mono text-[#8a8172]">Loading community…</div>
      ) : (
        <>
          {tab === 'events' && (
            <div className="space-y-3">
              <div className={`${cardCls} space-y-2`}>
                <div className="flex items-center gap-2 text-xs font-bold text-[#3a342a]"><Plus size={13} /> Create Event</div>
                <input className={inputCls} placeholder="Event title" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} />
                <textarea className={inputCls} placeholder="Description" value={evDesc} onChange={(e) => setEvDesc(e.target.value)} rows={2} />
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Location / Online" value={evLoc} onChange={(e) => setEvLoc(e.target.value)} />
                  <input className={inputCls} type="datetime-local" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
                </div>
                <button onClick={createEvent} className="w-full bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold py-2 rounded-xl hover:bg-[#52493b]">Publish</button>
              </div>

              {(state?.events || []).map((ev) => {
                const going = ev.attendees.includes(myId || '');
                return (
                  <div key={ev.id} className={cardCls}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-sm text-[#3a342a]">{ev.title}</div>
                      <span className="text-[9px] font-mono uppercase bg-[#f4f1ea] text-[#8a8172] px-2 py-0.5 rounded-full">{ev.category}</span>
                    </div>
                    <p className="text-[11px] text-[#5c5446]">{ev.description}</p>
                    <div className="flex flex-wrap gap-2 text-[10px] text-[#8a8172]">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {new Date(ev.date).toLocaleDateString()}</span>
                      <span className="inline-flex items-center gap-1"><MapPin size={11} /> {ev.location}</span>
                      <span className="inline-flex items-center gap-1"><Users size={11} /> {ev.attendees.length}{ev.capacity ? `/${ev.capacity}` : ''} going</span>
                    </div>
                    <button
                      onClick={() => rsvp(ev.id)}
                      className={`text-[10px] font-mono uppercase font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                        going ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-[#f4f1ea] text-[#3a342a] border-[#ebdcca] hover:bg-[#ebdcca]'
                      }`}
                    >
                      {going ? '✓ Going' : 'RSVP'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'questions' && (
            <div className="space-y-3">
              <div className={`${cardCls} space-y-2`}>
                <div className="flex items-center gap-2 text-xs font-bold text-[#3a342a]"><MessageCircleQuestion size={13} /> Ask the community</div>
                <textarea className={inputCls} placeholder="What would you like to ask?" value={qText} onChange={(e) => setQText(e.target.value)} rows={2} />
                <button onClick={askQuestion} className="w-full bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold py-2 rounded-xl hover:bg-[#52493b]">Ask</button>
              </div>

              {(state?.questions || []).map((q) => (
                <div key={q.id} className={`${cardCls} space-y-2`}>
                  <div className="text-sm font-semibold text-[#3a342a]">{q.text}</div>
                  <div className="text-[10px] text-[#8a8172] font-mono">{new Date(q.askedAt).toLocaleDateString()} · {q.answers.length} answers</div>
                  {q.answers.map((a) => (
                    <div key={a.id} className="bg-[#fbf9f4] border border-[#ebdcca] rounded-xl p-2.5 space-y-1">
                      <p className="text-[11px] text-[#3a342a]">{a.text}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-[#8a8172] font-mono">{a.by}</span>
                        <button onClick={() => upvote(q.id, a.id)} className={`inline-flex items-center gap-1 text-[9px] font-mono uppercase ${a.upvotes.includes(myId || '') ? 'text-amber-600' : 'text-[#8a8172]'}`}>
                          <ArrowUp size={10} /> {a.upvotes.length}
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input className={inputCls} placeholder="Write an answer…" value={answerText[q.id] || ''} onChange={(e) => setAnswerText((m) => ({ ...m, [q.id]: e.target.value }))} />
                    <button onClick={() => answer(q.id)} className="bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold px-3 rounded-xl"><Send size={11} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'topics' && (
            <div className="grid grid-cols-2 gap-3">
              {(state?.topics || []).map((t) => {
                const joined = t.members.includes(myId || '');
                return (
                  <div key={t.id} className={`${cardCls} space-y-2`}>
                    <div className="text-2xl">{t.emoji}</div>
                    <div className="font-bold text-xs text-[#3a342a]">{t.name}</div>
                    <div className="text-[10px] text-[#5c5446]">{t.description}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[#8a8172] font-mono">{t.members.length} members</span>
                      <button onClick={() => join(t.id)} className={`text-[9px] font-mono uppercase font-bold px-2.5 py-1 rounded-lg border ${joined ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-[#f4f1ea] text-[#3a342a] border-[#ebdcca]'}`}>
                        {joined ? 'Joined' : 'Join'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'studio' && (
            <div className="space-y-3">
              <div className="bg-gradient-to-br from-[#3a342a] to-[#52493b] rounded-2xl p-4 text-[#f4f1ea] space-y-1">
                <div className="font-display font-bold">{currentUser?.name || 'Creator'}</div>
                <div className="text-[10px] opacity-70 font-mono">Creator Studio — {new Date().toLocaleDateString()}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Posts', value: stats?.posts ?? 0, icon: <Sparkles size={13} /> },
                  { label: 'Reels', value: stats?.reels ?? 0, icon: <Music2 size={13} /> },
                  { label: 'Followers', value: stats?.followers ?? 0, icon: <Users size={13} /> },
                  { label: 'Likes', value: stats?.likes ?? 0, icon: <Heart size={13} /> },
                ].map((s) => (
                  <div key={s.label} className={cardCls}>
                    <div className="text-[#8a8172] flex items-center gap-1 text-[10px] font-mono uppercase">{s.icon}{s.label}</div>
                    <div className="text-2xl font-bold text-[#3a342a]">{s.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div className={`${cardCls} text-[11px] text-[#5c5446]`}>
                Growth tip: post reels during peak hours (6–9pm local) — reels get 3× reach. Engage with
                Topics you've joined to surface your content to those communities.
              </div>
            </div>
          )}

          {tab === 'rewards' && (
            <div className="space-y-3">
              <div className={`${cardCls} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center"><Coins size={16} /></div>
                  <div>
                    <div className="text-[10px] font-mono uppercase text-[#8a8172]">Your Points</div>
                    <div className="text-xl font-bold text-[#3a342a]">{balance.toLocaleString()}</div>
                  </div>
                </div>
                <span className="text-[9px] text-[#8a8172] font-mono">Earn by engaging & high trust</span>
              </div>

              {rewards.map((r) => (
                <div key={r.id} className={`${cardCls} flex items-center justify-between gap-3`}>
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{r.emoji}</div>
                    <div>
                      <div className="font-bold text-xs text-[#3a342a]">{r.name}</div>
                      <div className="text-[10px] text-[#8a8172]">{r.description}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => redeem(r.id)}
                    disabled={balance < r.cost}
                    className={`text-[10px] font-mono uppercase font-bold px-3 py-1.5 rounded-lg border whitespace-nowrap ${
                      balance < r.cost ? 'opacity-40 cursor-not-allowed bg-[#f4f1ea] text-[#8a8172] border-[#ebdcca]'
                      : 'bg-[#3a342a] text-[#f4f1ea] border-[#3a342a] hover:bg-[#52493b]'
                    }`}
                  >
                    {r.cost} pts
                  </button>
                </div>
              ))}

              {/* Tip creators */}
              <div className={`${cardCls} space-y-2`}>
                <div className="flex items-center gap-2 text-xs font-bold text-[#3a342a]"><Coins size={13} /> Tip a creator</div>
                <div className="flex gap-2">
                  <select className={inputCls} onChange={(e) => setTipTo(e.target.value)} value={tipTo || ''}>
                    <option value="">Select creator…</option>
                    {(creatorsList || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input className={`${inputCls} w-20`} type="number" min={1} value={tipAmount} onChange={(e) => setTipAmount(Number(e.target.value))} />
                </div>
                <input className={inputCls} placeholder="Note (optional)" value={tipNote} onChange={(e) => setTipNote(e.target.value)} />
                <button onClick={() => tip(tipTo || '')} disabled={!tipTo} className="w-full bg-amber-600 text-white text-[10px] font-mono uppercase font-bold py-2 rounded-xl hover:bg-amber-500 disabled:opacity-40">
                  Send {tipAmount} pts
                </button>
              </div>
            </div>
          )}

          {tab === 'smart' && (
            <SmartCommunity
              token={token}
              currentUser={currentUser}
              onClose={() => setTab('events')}
            />
          )}
        </>
      )}
    </div>
  );
}
