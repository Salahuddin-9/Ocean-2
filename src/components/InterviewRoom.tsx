import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mic, MicOff, Send, RotateCcw, Volume2, Loader2, Briefcase, CheckCircle2 } from 'lucide-react';

/**
 * Ocean — AI Mock Interview Room (Feature 192)
 * ---------------------------------------------
 * Role-based practice interviews with spoken questions (Web Speech TTS),
 * optional voice answers (Web Speech recognition) and scored evaluation.
 * Backed by /api/interview/*.
 */

interface InterviewRoomProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Session {
  id: string;
  role: string;
  status: 'active' | 'done';
  questionIdx: number;
  questions: string[];
  answers: { q: string; a: string; score: number }[];
  totalScore: number;
}

const ROLES = [
  { id: 'frontend', label: 'Frontend Engineer' },
  { id: 'backend', label: 'Backend Engineer' },
  { id: 'data', label: 'Data Analyst' },
  { id: 'product', label: 'Product Manager' },
  { id: 'general', label: 'General' },
];

export default function InterviewRoom({ token, currentUser, onClose }: InterviewRoomProps) {
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [speech, setSpeech] = useState(true);
  const [listening, setListening] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<{ score: number; done: boolean; totalScore: number | null; feedback?: string; mode?: string } | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const recRef = useRef<any>(null);

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

  const speak = (text: string) => {
    if (!speech || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98;
    window.speechSynthesis.speak(u);
  };

  const loadHistory = useCallback(async () => {
    try {
      const d = await api('/api/interview', 'GET');
      setHistory(d.sessions || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (currentUser) loadHistory(); }, [currentUser, loadHistory]);

  const start = async (role: string) => {
    setLoading(true);
    setResult(null);
    try {
      const d = await api('/api/interview/start', 'POST', { role });
      setSession(d.session);
      setQuestion(d.question);
      setTimeout(() => speak(d.question), 300);
      await loadHistory();
    } catch (e: any) {
      toast(e.message || 'Could not start interview.', 'destructive');
    } finally { setLoading(false); }
  };

  const submit = async () => {
    if (!session || answer.trim().length < 10) {
      toast('Give a real answer (min 10 characters).');
      return;
    }
    setLoading(true);
    try {
      const d = await api(`/api/interview/${session.id}/answer`, 'POST', { text: answer });
      setAnswer('');
      setResult({ score: d.score, done: d.done, totalScore: d.totalScore, feedback: d.feedback, mode: d.mode });
      if (d.done) {
        setQuestion('');
        await loadHistory();
      } else {
        setQuestion(d.question);
        setTimeout(() => speak(d.question), 300);
      }
    } catch (e: any) {
      toast(e.message || 'Failed to submit answer.', 'destructive');
    } finally { setLoading(false); }
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return toast('Speech recognition not supported in this browser.');
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript || '';
      setAnswer((prev) => (prev ? prev + ' ' : '') + text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const reset = () => {
    setSession(null);
    setQuestion('');
    setResult(null);
    setAnswer('');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Mock interview</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-violet-800/10 dark:bg-violet-400/10 flex items-center justify-center">
                  <Briefcase className="text-violet-800 dark:text-violet-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">AI Mock Interview</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Practice · spoken questions · scored</p>
                </div>
                <button onClick={() => setSpeech(v => !v)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-mono uppercase font-bold transition-all ${speech ? 'bg-violet-800/10 text-violet-800 dark:text-violet-300 border-violet-300 dark:border-violet-700' : 'bg-white text-[#8a8172] border-[#cfcac0] dark:border-zinc-700'}`}>
                  <Volume2 size={11} /> Voice
                </button>
              </div>

              {!session && (
                <div className="space-y-3">
                  <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                    Pick a role and answer a short sequence of questions. Your answers are scored on
                    keyword coverage and depth. Turn on <b>Voice</b> to hear questions read aloud.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ROLES.map(r => (
                      <button key={r.id} onClick={() => start(r.id)} disabled={loading}
                        className="flex flex-col items-start gap-1 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/40 hover:border-violet-400 hover:bg-violet-50/40 dark:hover:bg-zinc-800/60 transition-all text-left disabled:opacity-50">
                        <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">{r.label}</span>
                        <span className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">{r.id} · 4 questions</span>
                      </button>
                    ))}
                  </div>
                  {history.length > 0 && (
                    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 divide-y divide-[#ebdcca]/60 dark:divide-zinc-800">
                      {history.slice(0, 5).map(s => (
                        <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                          <CheckCircle2 size={12} className="text-violet-700 dark:text-violet-400 shrink-0" />
                          <span className="flex-1 text-xs text-[#3a342a] dark:text-zinc-100 capitalize">{s.role}</span>
                          <span className="font-mono text-[9px] text-[#8a8172] dark:text-zinc-500">{s.status}</span>
                          {s.status === 'done' && <span className="font-mono text-[10px] font-bold text-violet-800 dark:text-violet-300">{s.totalScore}/100</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {session && !result?.done && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                      {session.role} · Q{session.questionIdx + 1}/{session.questions.length}
                    </span>
                    <button onClick={reset} className="flex items-center gap-1 text-[10px] font-mono uppercase text-[#8a8172] dark:text-zinc-400 hover:text-[#3a342a] dark:hover:text-zinc-100">
                      <RotateCcw size={11} /> End
                    </button>
                  </div>
                  <div className="rounded-2xl bg-violet-800/5 dark:bg-violet-400/5 border border-violet-200/60 dark:border-violet-800/40 p-4">
                    <p className="font-display text-sm text-[#3a342a] dark:text-zinc-100 leading-relaxed">{question}</p>
                    <button onClick={() => speak(question)} className="mt-2 flex items-center gap-1 text-[10px] font-mono uppercase text-violet-700 dark:text-violet-300 hover:opacity-70">
                      <Volume2 size={10} /> Read aloud
                    </button>
                  </div>
                  <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={4} placeholder="Type your answer… (or use the mic)"
                    className={`${input} resize-none`} />
                  <div className="flex gap-2">
                    <button onClick={toggleMic} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-mono uppercase font-bold transition-all ${listening ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-[#3a342a] border-[#cfcac0] dark:border-zinc-700 dark:text-zinc-100'}`}>
                      {listening ? <MicOff size={11} /> : <Mic size={11} />} {listening ? 'Stop' : 'Mic'}
                    </button>
                    <button onClick={submit} disabled={loading || answer.trim().length < 10} className={`${btnPrimary} flex-1 justify-center`}>
                      {loading ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Submit answer
                    </button>
                  </div>
                  {result && (
                    <div className="space-y-1">
                      <p className="font-mono text-[10px] text-violet-800 dark:text-violet-300">
                        Scored {result.score}/100 — {result.done ? 'interview complete' : 'next question →'}
                        {result.mode === 'llm' && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">· AI-graded</span>}
                      </p>
                      {result.feedback && !result.done && (
                        <p className="text-[10px] text-[#5c5446] dark:text-zinc-400 italic">{result.feedback}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {session && result?.done && (
                <div className="space-y-4 text-center py-4">
                  <CheckCircle2 className="mx-auto text-violet-700 dark:text-violet-400" size={30} />
                  <div>
                    <div className="font-display text-4xl font-bold text-[#3a342a] dark:text-zinc-100">{result.totalScore}<span className="text-lg text-[#8a8172]">/100</span></div>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 mt-1">Overall score · {session.role}</p>
                  </div>
                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 divide-y divide-[#ebdcca]/60 dark:divide-zinc-800 text-left max-h-56 overflow-y-auto">
                    {session.answers.map((a, i) => (
                      <div key={i} className="px-3 py-2">
                        <div className="flex justify-between gap-2">
                          <span className="text-[10px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1">{a.q}</span>
                          <span className="font-mono text-[10px] text-violet-700 dark:text-violet-300 shrink-0">{a.score}</span>
                        </div>
                        <p className="text-[10px] text-[#8a8172] dark:text-zinc-400 line-clamp-2 mt-1">{a.a}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={reset} className={`${btnPrimary} mx-auto`}>
                    <RotateCcw size={11} /> Try another role
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
