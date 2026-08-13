import { useCallback, useEffect, useState } from 'react';
import { Briefcase, TrendingUp, BadgeCheck, Plus, Star, Award, Send, BookOpenCheck, Users } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Skill { id: string; userId: string; name: string; category: string; level: number; endorsements: { by: string; byName: string }[]; endorsementCount: number; verified: boolean }
interface Rec { id: string; fromName: string; text: string; relationship: string; at: number }
interface RecRequest { id: string; from: string; fromName: string; note: string }
interface Job { id: string; company: string; title: string; description: string; skills: string[]; budget: number; location: string; applicantCount: number; score?: number; applied?: boolean; recruiterId: string }
interface Profile { userId: string; name: string; skills: Skill[]; recommendations: Rec[] }

interface QuizQuestion { q: string; options: string[]; correct: number }

async function api<T>(path: string, token: string | null, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: authHeaders(token), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || 'Request failed');
  return res.json() as Promise<T>;
}

export default function ProGraph({ token, currentUser, onClose }: Props) {
  const [tab, setTab] = useState<'profile' | 'jobs'>('profile');
  const [profileId, setProfileId] = useState(currentUser?.id || '');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [skillForm, setSkillForm] = useState({ name: '', category: 'general', level: 3 });
  const [recText, setRecText] = useState('');
  const [recTo, setRecTo] = useState('');
  const [recReqTo, setRecReqTo] = useState('');
  const [requests, setRequests] = useState<RecRequest[]>([]);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [quizSkill, setQuizSkill] = useState<string | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [matches, setMatches] = useState<Job[]>([]);
  const [jobForm, setJobForm] = useState({ company: '', title: '', description: '', skills: '', budget: 0, location: 'Remote' });

  const loadProfile = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        api<{ profile: Profile }>(`/api/prograph/profile/${profileId}`, token),
        api<{ requests: RecRequest[] }>('/api/prograph/recommendations/requests', token),
      ]);
      setProfile(p.profile); setRequests(r.requests);
    } catch { /* offline */ }
  }, [profileId, token]);

  const loadJobs = useCallback(async () => {
    try {
      const [j, m] = await Promise.all([
        api<{ jobs: Job[] }>('/api/prograph/jobs', token),
        api<{ jobs: Job[] }>('/api/prograph/jobs/matches', token),
      ]);
      setJobs(j.jobs); setMatches(m.jobs);
    } catch { /* offline */ }
  }, [token]);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  const act = async (path: string, body: unknown, okMsg: string, then?: () => void) => {
    try { await api(path, token, body); toast(okMsg); then?.(); loadProfile(); loadJobs(); }
    catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  const startQuiz = async (skill: Skill) => {
    try {
      const d = await api<{ questions: QuizQuestion[]; skillName: string }>(`/api/prograph/skills/${skill.id}/quiz`, token);
      setQuiz(d.questions); setQuizSkill(d.skillName); setAnswers(d.questions.map(() => -1));
    } catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  const submitQuiz = async () => {
    if (quiz && quizSkill && answers.every((a) => a >= 0)) {
      const skill = profile?.skills.find((s) => s.name === quizSkill);
      if (skill) await act(`/api/prograph/skills/${skill.id}/verify`, { answers }, '📝 Quiz submitted');
      setQuiz(null); setQuizSkill(null);
    } else toast('⛔ Answer all questions first');
  };

  return (
    <FeatureShell title="Ocean Pro Graph" badge="256 · linkedin-level" icon={<Briefcase size={18} className="text-indigo-700 dark:text-indigo-400" />} onClose={onClose}>
      <div className="flex items-center gap-1.5 mb-3">
        {([['profile', 'Profile & skills'], ['jobs', 'Jobs & hiring']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
            {label}
          </button>
        ))}
        {tab === 'profile' && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[9px] text-[#8a8172] font-bold">Profile:</span>
            <input value={profileId} onChange={(e) => setProfileId(e.target.value)} className="w-36 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[10px] font-mono outline-none" />
          </div>
        )}
      </div>

      {quiz && (
        <div className="fixed inset-0 z-[130] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-2xl p-4 max-w-md w-full border border-[#ebdcca] dark:border-zinc-700">
            <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100 mb-3 flex items-center gap-1.5"><BookOpenCheck size={14} className="text-indigo-500" /> Verify "{quizSkill}"</p>
            {quiz.map((q, i) => (
              <div key={i} className="mb-3">
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-200">{i + 1}. {q.q}</p>
                <div className="mt-1 space-y-1">
                  {q.options.map((opt, j) => (
                    <button key={j} onClick={() => setAnswers((a) => a.map((v, k) => (k === i ? j : v)))}
                      className={`w-full text-left rounded-lg border px-2.5 py-1.5 text-[10px] transition-all ${answers[i] === j ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-1.5">
              <button onClick={submitQuiz} className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold py-2">Submit</button>
              <button onClick={() => { setQuiz(null); setQuizSkill(null); }} className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 px-3 text-[10px] font-bold text-[#8a8172]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'profile' && profile && (
        <div className="grid md:grid-cols-2 gap-3">
          {/* LinkedIn-style profile header */}
          <div className="md:col-span-2 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-lg font-bold text-white shrink-0">{profile.name.slice(0, 1).toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-[#3a342a] dark:text-zinc-100">{profile.name}</p>
              <p className="text-[9px] text-[#8a8172]">💼 Open to work · {profile.skills.length} skills · {profile.skills.filter((s) => s.verified).length} verified · {profile.recommendations.length} recommendations · {profile.skills.reduce((a, s) => a + s.endorsementCount, 0)} endorsements</p>
              <div className="mt-1.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${Math.min(100, Math.max(8, profile.skills.length * 22 + profile.skills.filter((s) => s.verified).length * 8))}%` }} />
              </div>
            </div>
            <span className="text-[8px] font-mono uppercase text-[#8a8172] shrink-0">Profile strength</span>
          </div>

          <div className="space-y-3">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Skills — {profile.name}</p>
              <div className="flex gap-1.5 mb-2">
                <input value={skillForm.name} onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })} placeholder="Skill (e.g. React)" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
                <select value={skillForm.category} onChange={(e) => setSkillForm({ ...skillForm, category: e.target.value })} className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-[11px] outline-none">
                  {['general', 'tech', 'design', 'business', 'language', 'craft'].map((c) => <option key={c}>{c}</option>)}
                </select>
                <button onClick={() => { if (skillForm.name.trim()) { act('/api/prograph/skills', skillForm, '✅ Skill added'); setSkillForm({ name: '', category: 'general', level: 3 }); } }}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-2.5"><Plus size={12} /></button>
              </div>
              <div className="space-y-1.5">
                {profile.skills.map((s) => (
                  <div key={s.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-2">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{s.name}</p>
                      {s.verified && <span className="flex items-center gap-0.5 text-[8px] font-bold text-emerald-600 dark:text-emerald-400"><BadgeCheck size={10} />verified</span>}
                      <span className="text-[8px] text-[#8a8172] font-mono uppercase">#{s.category} · Lv{s.level}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="flex items-center gap-0.5 text-[8px] text-[#8a8172]"><Star size={8} className="text-amber-500" /> {s.endorsementCount} endorsements</span>
                      {!s.verified && s.userId === currentUser?.id && (
                        <button onClick={() => startQuiz(s)} className="ml-auto text-[8px] font-bold text-indigo-600 hover:text-indigo-500">Take quiz →</button>
                      )}
                      {s.userId !== currentUser?.id && (
                        <button onClick={() => act(`/api/prograph/skills/${s.id}/endorse`, {}, '⭐ Endorsed!')} className="ml-auto text-[8px] font-bold text-amber-600 hover:text-amber-500">Endorse</button>
                      )}
                    </div>
                    {s.endorsements.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1">
                        {s.endorsements.slice(0, 6).map((e, i) => (
                          <span key={i} className="text-[7px] bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-full px-1.5 py-0.5 text-indigo-700 dark:text-indigo-300">⭐ {e.byName}</span>
                        ))}
                        {s.endorsements.length > 6 && <span className="text-[7px] text-[#8a8172] self-center">+{s.endorsements.length - 6} more</span>}
                      </div>
                    )}
                  </div>
                ))}
                {profile.skills.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No skills yet — add your first one.</p>}
              </div>
            </div>

            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Award size={11} /> Recommendations</p>
              <div className="space-y-1.5">
                {profile.recommendations.map((r) => (
                  <div key={r.id} className="rounded-lg bg-white/70 dark:bg-zinc-800/70 border border-[#ebdcca] dark:border-zinc-700 p-2">
                    <p className="text-[10px] text-[#3a342a] dark:text-zinc-200">{r.text}</p>
                    <p className="text-[8px] text-[#8a8172] mt-0.5">— {r.fromName} · {r.relationship}</p>
                  </div>
                ))}
                {profile.recommendations.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No recommendations yet.</p>}
              </div>
              {profile.userId === currentUser?.id && (
                <div className="mt-2 flex gap-1.5">
                  <input value={recReqTo} onChange={(e) => setRecReqTo(e.target.value)} placeholder="Ask user id for a rec" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[10px] outline-none" />
                  <button onClick={() => { if (recReqTo.trim()) { act('/api/prograph/recommendations/request', { toUserId: recReqTo }, '📨 Request sent'); setRecReqTo(''); } }} className="rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 text-[10px] font-bold"><Send size={11} /></button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {profile.userId !== currentUser?.id && (
              <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
                <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Write a recommendation</p>
                <textarea value={recText} onChange={(e) => setRecText(e.target.value)} rows={3} placeholder={`Recommend ${profile.name}…`}
                  className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none resize-none" />
                <div className="flex gap-1.5 mt-1.5">
                  <select value={recTo} onChange={(e) => setRecTo(e.target.value)} className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-[10px] outline-none">
                    {['colleague', 'manager', 'client', 'mentor', 'student'].map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <button onClick={() => { if (recText.trim()) { act('/api/prograph/recommendations', { toUserId: profile.userId, text: recText, relationship: recTo || 'colleague' }, '⭐ Recommendation posted'); setRecText(''); } }}
                    className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold py-2">Post recommendation</button>
                </div>
              </div>
            )}

            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Users size={11} /> Incoming requests ({requests.length})</p>
              {requests.map((r) => (
                <div key={r.id} className="py-1.5 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                  <p className="text-[10px] font-bold text-[#3a342a] dark:text-zinc-200">{r.fromName} asked for a recommendation</p>
                  <p className="text-[8px] text-[#8a8172]">{r.note || '—'}</p>
                </div>
              ))}
              {requests.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No incoming requests.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'jobs' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-3">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Post a job (recruiter)</p>
              <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                <input value={jobForm.company} onChange={(e) => setJobForm({ ...jobForm, company: e.target.value })} placeholder="Company" className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
                <input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} placeholder="Job title" className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
              </div>
              <input value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} placeholder="Description" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none mb-1.5" />
              <div className="flex gap-1.5">
                <input value={jobForm.skills} onChange={(e) => setJobForm({ ...jobForm, skills: e.target.value })} placeholder="Skills (comma)" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
                <input type="number" min={0} value={jobForm.budget} onChange={(e) => setJobForm({ ...jobForm, budget: Number(e.target.value) })} placeholder="Budget" className="w-20 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
                <button onClick={() => { if (jobForm.title.trim() && jobForm.company.trim()) { act('/api/prograph/jobs', { ...jobForm, skills: jobForm.skills.split(',').map((s) => s.trim()).filter(Boolean) }, '💼 Job posted'); setJobForm({ company: '', title: '', description: '', skills: '', budget: 0, location: 'Remote' }); } }}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-2.5"><Plus size={12} /></button>
              </div>
            </div>

            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><TrendingUp size={11} /> Best matches for your skills</p>
              {matches.filter((j) => j.score > 0).slice(0, 5).map((j) => (
                <div key={j.id} className="flex items-center gap-2 py-1.5 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 truncate">{j.title} · {j.company}</p>
                    <p className="text-[8px] text-[#8a8172]">{j.skills.join(', ')}</p>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400">{j.score}%</span>
                  <button onClick={() => act(`/api/prograph/jobs/${j.id}/apply`, {}, '📨 Applied!')} disabled={j.applied}
                    className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white text-[9px] font-bold px-2 py-1">{j.applied ? 'Applied' : 'Apply'}</button>
                </div>
              ))}
              {matches.filter((j) => j.score > 0).length === 0 && <p className="text-[9px] text-[#8a8172] italic">Add skills to see match scores.</p>}
            </div>
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Open jobs ({jobs.length})</p>
            <div className="space-y-1.5 max-h-[28rem] overflow-y-auto pr-1">
              {jobs.map((j) => (
                <div key={j.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{j.title}</p>
                    <span className="text-[8px] text-[#8a8172] font-mono">{j.budget > 0 ? `${j.budget}🪙` : 'unpaid'}</span>
                  </div>
                  <p className="text-[9px] text-[#8a8172]">{j.company} · {j.location} · {j.applicantCount} applicants</p>
                  <p className="text-[9px] text-[#8a8172] mt-0.5 line-clamp-2">{j.description}</p>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {j.skills.map((s) => <span key={s} className="text-[8px] bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-full px-1.5 py-0.5 text-[#8a8172]">{s}</span>)}
                  </div>
                </div>
              ))}
              {jobs.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No open jobs.</p>}
            </div>
          </div>
        </div>
      )}
    </FeatureShell>
  );
}
