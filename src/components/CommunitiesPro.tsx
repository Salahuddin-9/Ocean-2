import { useCallback, useEffect, useState } from 'react';
import { MessagesSquare, Mic, Radio, Sparkles, Plus, Send, Volume2, ChevronDown, ChevronRight, LayoutTemplate, Headphones, CalendarClock } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import LiveKitVoiceRoom from './LiveKitVoiceRoom';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface VoiceRoom { id: string; name: string; hostId: string; hostName: string; members: string[]; memberCount: number }
interface StageChannel { id: string; name: string; hostId: string; hostName: string; speakers: string[]; listeners: string[]; listenerCount: number }
interface ThreadReply { id: string; text: string; by: string; byName: string; at: number }
interface ThreadChannel { id: string; title: string; text: string; authorId: string; authorName: string; replies: ThreadReply[]; createdAt: number }
interface Template { id: string; name: string; channels: { type: string; name: string }[] }
interface SchedEvent { id: string; title: string; description?: string; startsAt: number; endsAt: number; hostId: string; hostName: string; rsvps: { userId: string; status: string; at: number }[]; createdAt: number }

async function api<T>(path: string, token: string | null, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: authHeaders(token), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || 'Request failed');
  return res.json() as Promise<T>;
}

export default function CommunitiesPro({ token, currentUser, onClose }: Props) {
  const [cid, setCid] = useState('ocean');
  const [voice, setVoice] = useState<VoiceRoom[]>([]);
  const [stages, setStages] = useState<StageChannel[]>([]);
  const [threads, setThreads] = useState<ThreadChannel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newVoice, setNewVoice] = useState('');
  const [newStage, setNewStage] = useState('');
  const [tTitle, setTTitle] = useState('');
  const [tText, setTText] = useState('');
  const [reply, setReply] = useState<Record<string, string>>({});
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [livekitRoom, setLivekitRoom] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplChannels, setTplChannels] = useState('voice: General\nstage: Town Hall\ntext: general');
  const [stats, setStats] = useState<{ voiceRooms: number; stages: number; threads: number; events: number } | null>(null);
  const [upcoming, setUpcoming] = useState<SchedEvent[]>([]);
  const [past, setPast] = useState<SchedEvent[]>([]);
  const [evTitle, setEvTitle] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [evDate, setEvDate] = useState('');

  const load = useCallback(async () => {
    try {
      const [v, s, t, tp, st, ev] = await Promise.all([
        api<{ voice: VoiceRoom[] }>(`/api/communities/${cid}/voice`, token),
        api<{ stages: StageChannel[] }>(`/api/communities/${cid}/stages`, token),
        api<{ threads: ThreadChannel[] }>(`/api/communities/${cid}/threads`, token),
        api<{ templates: Template[] }>(`/api/communities/${cid}/templates`, token),
        api<{ voiceRooms: number; stages: number; threads: number; events: number }>(`/api/communities/${cid}/stats`, token),
        api<{ upcoming: SchedEvent[]; past: SchedEvent[] }>(`/api/communities/${cid}/events`, token),
      ]);
      setVoice(v.voice); setStages(s.stages); setThreads(t.threads); setTemplates(tp.templates); setStats(st); setUpcoming(ev.upcoming); setPast(ev.past);
    } catch { /* offline */ }
  }, [cid, token]);

  useEffect(() => { load(); }, [load]);

  const act = async (path: string, body?: unknown, okMsg?: string) => {
    try { await api(path, token, body); if (okMsg) toast(okMsg); load(); }
    catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  return (
    <FeatureShell title="Communities Pro" badge="254 · discord-level" icon={<MessagesSquare size={18} className="text-blue-700 dark:text-blue-400" />} onClose={onClose}>
      {livekitRoom && (
        <LiveKitVoiceRoom roomName={livekitRoom} userName={currentUser?.name || 'User'} token={token} onClose={() => setLivekitRoom(null)} />
      )}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[10px] font-bold text-[#8a8172]">Community:</span>
        <input value={cid} onChange={(e) => setCid(e.target.value)} className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] font-mono outline-none focus:border-blue-400 w-32" />
        <span className="text-[9px] text-[#8a8172]">{stats ? `${stats.voiceRooms} voice · ${stats.stages} stages · ${stats.threads} threads · ${stats.events} events` : '…'}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* Voice rooms */}
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Radio size={11} /> Voice rooms <span className="ml-auto flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Headphones size={10} /> LiveKit audio</span></p>
          <div className="flex gap-1.5 mb-2">
            <input value={newVoice} onChange={(e) => setNewVoice(e.target.value)} placeholder="New voice room…" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
            <button onClick={() => { if (newVoice.trim()) { act(`/api/communities/${cid}/voice`, { name: newVoice }, '🔊 Voice room created'); setNewVoice(''); } }}
              className="rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-2.5"><Plus size={12} /></button>
          </div>
          <div className="space-y-1.5">
            {voice.map((v) => {
              const joined = v.members.includes(currentUser?.id || '');
              return (
                <div key={v.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-2">
                  <div className="flex items-center gap-1.5">
                    <Volume2 size={12} className={joined ? 'text-emerald-500' : 'text-[#8a8172]'} />
                    <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{v.name}</p>
                    <span className="text-[8px] text-[#8a8172] font-mono">{v.memberCount} in</span>
                    {!joined && (
                      <button
                        onClick={async () => {
                          try {
                            await api(`/api/communities/${cid}/voice/${v.id}/join`, token, {});
                            setLivekitRoom(v.name);
                            load();
                          } catch (e: any) { toast(`⛔ ${e.message}`); }
                        }}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 text-[9px] font-bold transition-all">
                        <Headphones size={10} className="inline mr-1" />Join (LiveKit)
                      </button>
                    )}
                    <button onClick={() => act(`/api/communities/${cid}/voice/${v.id}/join`, { leave: true }, 'Left voice')}
                      className={`rounded-lg px-2 py-1 text-[9px] font-bold transition-all ${joined ? 'bg-zinc-800 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
                      {joined ? 'Leave' : 'Membership'}
                    </button>
                  </div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {v.members.map((m) => <span key={m} className="text-[8px] bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-full px-1.5 py-0.5 text-[#8a8172]">{m === v.hostId ? '👑 ' : ''}{m.slice(0, 10)}</span>)}
                  </div>
                </div>
              );
            })}
            {voice.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No voice rooms. Persistent WebRTC rooms — join with the app's P2P/Jitsi call layer.</p>}
          </div>
        </div>

        {/* Stages */}
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Mic size={11} /> Stage channels</p>
          <div className="flex gap-1.5 mb-2">
            <input value={newStage} onChange={(e) => setNewStage(e.target.value)} placeholder="New stage…" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
            <button onClick={() => { if (newStage.trim()) { act(`/api/communities/${cid}/stages`, { name: newStage }, '🎤 Stage created'); setNewStage(''); } }}
              className="rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-2.5"><Plus size={12} /></button>
          </div>
          <div className="space-y-1.5">
            {stages.map((s) => {
              const isHost = s.hostId === currentUser?.id;
              const meSpeaker = s.speakers.includes(currentUser?.id || '');
              const meListener = s.listeners.includes(currentUser?.id || '');
              return (
                <div key={s.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-2">
                  <div className="flex items-center gap-1.5">
                    <Mic size={12} className={meSpeaker ? 'text-violet-500' : 'text-[#8a8172]'} />
                    <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{s.name}</p>
                    <span className="text-[8px] text-[#8a8172] font-mono">{s.speakers.length}🎤 {s.listenerCount}👂</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {s.speakers.map((sp) => (
                      <span key={sp} className="flex items-center gap-1 text-[8px] bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-full px-1.5 py-0.5 text-violet-700 dark:text-violet-300">
                        🎤 {sp === s.hostId ? `👑 ${sp.slice(0, 10)}` : sp.slice(0, 10)}
                        {isHost && sp !== s.hostId && <button onClick={() => act(`/api/communities/${cid}/stages/${s.id}/speaker`, { userId: sp, on: false })} className="text-rose-500 hover:text-rose-400">✕</button>}
                      </span>
                    ))}
                    {isHost && s.listeners.map((ls) => (
                      <span key={ls} className="flex items-center gap-1 text-[8px] bg-zinc-100 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-full px-1.5 py-0.5 text-[#8a8172]">
                        👂 {ls.slice(0, 10)}
                        <button onClick={() => act(`/api/communities/${cid}/stages/${s.id}/speaker`, { userId: ls, on: true })} className="text-emerald-600 hover:text-emerald-500" title="Promote to speaker">▲</button>
                      </span>
                    ))}
                    {!meSpeaker && !meListener && !isHost && (
                      <button onClick={() => act(`/api/communities/${cid}/stages/${s.id}/join`, {}, 'Listening on stage')} className="text-[8px] bg-violet-600 text-white rounded-full px-2 py-0.5 font-bold">Join as listener</button>
                    )}
                  </div>
                </div>
              );
            })}
            {stages.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No stages. Hosts manage speaker/listener roles.</p>}
          </div>
        </div>

        {/* Threads */}
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3 md:col-span-2">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Sparkles size={11} /> Thread channels</p>
          <div className="flex gap-1.5 mb-2">
            <input value={tTitle} onChange={(e) => setTTitle(e.target.value)} placeholder="Thread title…" className="w-1/3 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
            <input value={tText} onChange={(e) => setTText(e.target.value)} placeholder="First message…" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
            <button onClick={() => { if (tTitle.trim()) { act(`/api/communities/${cid}/threads`, { title: tTitle, text: tText }, '🧵 Thread created'); setTTitle(''); setTText(''); } }}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-2.5"><Plus size={12} /></button>
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {threads.map((t) => (
              <div key={t.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-2">
                <button onClick={() => setOpenThread(openThread === t.id ? null : t.id)} className="flex items-center gap-1.5 w-full text-left">
                  {openThread === t.id ? <ChevronDown size={12} className="text-[#8a8172]" /> : <ChevronRight size={12} className="text-[#8a8172]" />}
                  <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{t.title}</p>
                  <span className="text-[8px] text-[#8a8172] font-mono">{t.replies.length} replies</span>
                </button>
                <p className="text-[10px] text-[#8a8172] mt-1 ml-5">{t.text}</p>
                <p className="text-[8px] text-[#8a8172] ml-5 mt-0.5">by {t.authorName}</p>
                {openThread === t.id && (
                  <div className="ml-5 mt-2 space-y-1">
                    {t.replies.map((r) => (
                      <div key={r.id} className="rounded-lg bg-white/70 dark:bg-zinc-800/70 border border-[#ebdcca] dark:border-zinc-700 px-2 py-1.5">
                        <p className="text-[10px] text-[#3a342a] dark:text-zinc-200"><b>{r.byName}</b> {r.text}</p>
                      </div>
                    ))}
                    <div className="flex gap-1.5">
                      <input value={reply[t.id] || ''} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} placeholder="Reply…" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
                      <button onClick={() => { if ((reply[t.id] || '').trim()) { act(`/api/communities/${cid}/threads/${t.id}/reply`, { text: reply[t.id] }); setReply({ ...reply, [t.id]: '' }); } }}
                        className="rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white px-2.5"><Send size={12} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {threads.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No threads yet.</p>}
          </div>
        </div>

        {/* Scheduled events */}
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3 md:col-span-2">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><CalendarClock size={11} /> Scheduled events</p>
          <div className="flex gap-1.5 mb-2 flex-wrap">
            <input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder="Event title (live stream, meetup, stage night…)" className="w-64 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
            <input type="datetime-local" value={evDate} onChange={(e) => setEvDate(e.target.value)} className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none text-[#8a8172]" />
            <button onClick={() => {
              const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0);
              setEvDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`);
            }} className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 px-2 py-1.5 text-[9px] font-bold text-[#8a8172] hover:border-blue-400">Next hour</button>
            <button onClick={() => {
              const startsAt = new Date(evDate).getTime();
              if (!evTitle.trim()) return toast('⛔ Event title required');
              if (!startsAt || Number.isNaN(startsAt)) return toast('⛔ Pick a start time');
              act(`/api/communities/${cid}/events`, { title: evTitle, description: evDesc, startsAt, durationMin: 60 }, '📅 Event scheduled');
              setEvTitle(''); setEvDesc(''); setEvDate('');
            }} className="rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-3">Schedule</button>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {upcoming.map((e) => {
              const myRsvp = e.rsvps.find((r) => r.userId === currentUser?.id)?.status;
              const yes = e.rsvps.filter((r) => r.status === 'yes').length;
              const maybe = e.rsvps.filter((r) => r.status === 'maybe').length;
              const fmt = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              return (
                <div key={e.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <CalendarClock size={12} className="text-blue-500" />
                    <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{e.title}</p>
                    <span className="text-[8px] font-mono text-[#8a8172]">{fmt(e.startsAt)} · {Math.round((e.endsAt - e.startsAt) / 60000)} min</span>
                    <span className="ml-auto flex items-center gap-1 text-[9px]">
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">✓ {yes}</span>
                      <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 font-bold text-amber-700 dark:text-amber-300">~ {maybe}</span>
                      {['yes', 'maybe', 'no'].map((st) => (
                        <button key={st} onClick={() => act(`/api/communities/${cid}/events/${e.id}/rsvp`, { status: st })}
                          className={`rounded-full px-1.5 py-0.5 font-bold transition-all ${myRsvp === st ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700 hover:border-blue-400'}`}>
                          {st === 'yes' ? 'Going' : st === 'maybe' ? 'Maybe' : 'No'}
                        </button>
                      ))}
                    </span>
                  </div>
                  {e.description && <p className="text-[10px] text-[#8a8172] mt-1 ml-5">{e.description}</p>}
                  <p className="text-[8px] text-[#8a8172] mt-0.5 ml-5">Hosted by {e.hostName} · {e.rsvps.length} RSVPs</p>
                </div>
              );
            })}
            {upcoming.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No upcoming events — schedule a stream or meetup.</p>}
            {past.length > 0 && (
              <details className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-2">
                <summary className="text-[9px] font-bold text-[#8a8172] cursor-pointer">Past events ({past.length})</summary>
                <div className="mt-1.5 space-y-1">
                  {past.map((e) => (
                    <p key={e.id} className="text-[9px] text-[#8a8172]"><CalendarClock size={9} className="inline mr-1" />{e.title} — {new Date(e.startsAt).toLocaleDateString()}</p>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>

        {/* Templates */}
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3 md:col-span-2">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><LayoutTemplate size={11} /> Server templates</p>
          <div className="grid sm:grid-cols-3 gap-1.5 mb-2">
            {templates.map((t) => (
              <div key={t.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-2">
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{t.name}</p>
                <p className="text-[8px] text-[#8a8172] mt-0.5">{t.channels.map((c) => `${c.type === 'voice' ? '🔊' : c.type === 'stage' ? '🎤' : c.type === 'thread' ? '🧵' : '💬'} ${c.name}`).join(' · ')}</p>
                <button onClick={() => act(`/api/communities/${cid}/templates/${t.id}/apply`, {}, `✅ Template applied — channels created`)}
                  className="mt-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-bold px-2.5 py-1">Apply</button>
              </div>
            ))}
          </div>
          <details className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-2">
            <summary className="text-[10px] font-bold text-[#8a8172] cursor-pointer">Create your own template</summary>
            <div className="mt-2 flex gap-1.5">
              <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name" className="w-40 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
              <textarea value={tplChannels} onChange={(e) => setTplChannels(e.target.value)} rows={3} placeholder="voice: Name&#10;stage: Name&#10;text: Name" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none resize-none" />
              <button onClick={() => {
                const channels = tplChannels.split('\n').map((l) => l.split(':')).filter((p) => p.length === 2).map(([type, name]) => ({ type: type.trim(), name: name.trim() }));
                if (!tplName.trim() || !channels.length) return toast('⛔ Name + channels in "type: name" format');
                act(`/api/communities/${cid}/templates`, { name: tplName, channels }, '📋 Template saved'); setTplName('');
              }} className="self-end rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold px-3 py-2">Save</button>
            </div>
          </details>
        </div>
      </div>
    </FeatureShell>
  );
}
