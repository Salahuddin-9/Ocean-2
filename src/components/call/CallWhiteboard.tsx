import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Pencil, Eraser, Slash, Square, Circle as CircleIcon, Type, Trash2, Undo2,
  Save, X, Grid3x3,
} from 'lucide-react';

/**
 * Ocean — Shared Workspace Whiteboard (collaborative canvas)
 * -----------------------------------------------------------
 * Used inside video calls (pass an existing `boardId` to join a shared board)
 * or standalone (no boardId -> a fresh session is created on /api/whiteboard).
 *
 * Drawing model:
 *  - Native pointer events on an <svg viewBox="0 0 1600 900">.
 *  - Tools: pen / line / rect / ellipse / text (click + prompt) / eraser / clear-all.
 *  - Elements are persisted to /api/whiteboard/session/:id/elements (the
 *    canonical snapshot used for late join + reload). The creator's Save button
 *    replaces it; a reload always re-renders from that snapshot.
 *
 * Real-time sync (wire protocol, over the existing /ws/chat channel):
 *  - open ->  {type:"auth", token, userId, name, username}
 *  - open ->  {type:"whiteboard_subscribe", boardId}
 *  - draw ->  {type:"whiteboard_event", boardId, event: WBElement}
 *  - recv ->  {type:"whiteboard_event", boardId, event, from}   (ignore own `from`)
 *  - recv ->  {type:"whiteboard_state", boardId, elements}      (replace all)
 *
 * The component also works fully standalone: every WebSocket call is guarded,
 * so if the socket fails or the chat server has no whiteboard relay yet,
 * local drawing + saving still work.
 */

export const WB_PROTOCOL = {
  AUTH: 'auth',
  SUBSCRIBE: 'whiteboard_subscribe',
  EVENT: 'whiteboard_event',
  STATE: 'whiteboard_state',
} as const;

type Tool = 'pen' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'text' | 'clear';

/** Local copy of the backend WBElement shape (component stays self-contained). */
interface WBElement {
  id: string;
  tool: Tool;
  color: string;
  width: number;
  points?: [number, number][];
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  w?: number;
  h?: number;
  text?: string;
  createdAt: number;
  by: string;
  byName?: string;
}

interface CallWhiteboardProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
  boardId?: string;
  title?: string;
}

const BOARD_W = 1600;
const BOARD_H = 900;

const SWATCHES = [
  { label: 'black', value: '#111111' },
  { label: 'red', value: '#dc2626' },
  { label: 'blue', value: '#2563eb' },
  { label: 'green', value: '#16a34a' },
  { label: 'amber', value: '#d97706' },
  { label: 'zinc', value: '#71717a' },
];

const STROKE_WIDTHS = [2, 4, 8, 14, 24];

const TOOLS: { id: Tool; label: string; icon: typeof Pencil }[] = [
  { id: 'pen', label: 'Pen', icon: Pencil },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'line', label: 'Line', icon: Slash },
  { id: 'rect', label: 'Rect', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: CircleIcon },
  { id: 'text', label: 'Text', icon: Type },
];

let seq = 0;
function wbUid(): string {
  seq += 1;
  return `wb-${Date.now()}-${seq}-${Math.floor(Math.random() * 1000)}`;
}

/** Rebuilds a render list honoring `clear` markers (a clear wipes everything before it). */
function computeRenderList(elements: WBElement[]): WBElement[] {
  const out: WBElement[] = [];
  for (const el of elements) {
    if (el.tool === 'clear') out.length = 0;
    else out.push(el);
  }
  return out;
}

function renderElement(el: WBElement): React.ReactNode {
  switch (el.tool) {
    case 'pen':
    case 'eraser':
      if (!el.points || el.points.length < 2) return null;
      return (
        <polyline
          key={el.id}
          fill="none"
          stroke={el.tool === 'eraser' ? '#ffffff' : el.color}
          strokeWidth={el.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={el.points.map(p => `${p[0]},${p[1]}`).join(' ')}
        />
      );
    case 'line':
      return (
        <line
          key={el.id}
          x1={el.x ?? 0}
          y1={el.y ?? 0}
          x2={el.x2 ?? el.x ?? 0}
          y2={el.y2 ?? el.y ?? 0}
          stroke={el.color}
          strokeWidth={el.width}
          strokeLinecap="round"
        />
      );
    case 'rect':
      {
        const x = el.x ?? 0;
        const y = el.y ?? 0;
        const x2 = el.x2 ?? x;
        const y2 = el.y2 ?? y;
        return (
          <rect
            key={el.id}
            x={Math.min(x, x2)}
            y={Math.min(y, y2)}
            width={Math.abs(x2 - x)}
            height={Math.abs(y2 - y)}
            fill="none"
            stroke={el.color}
            strokeWidth={el.width}
          />
        );
      }
    case 'ellipse':
      {
        const x = el.x ?? 0;
        const y = el.y ?? 0;
        const x2 = el.x2 ?? x;
        const y2 = el.y2 ?? y;
        const rx = Math.abs(x2 - x) / 2;
        const ry = Math.abs(y2 - y) / 2;
        if (rx < 0.5 && ry < 0.5) return null;
        return (
          <ellipse
            key={el.id}
            cx={(x + x2) / 2}
            cy={(y + y2) / 2}
            rx={Math.max(rx, 0.5)}
            ry={Math.max(ry, 0.5)}
            fill="none"
            stroke={el.color}
            strokeWidth={el.width}
          />
        );
      }
    case 'text':
      return (
        <text
          key={el.id}
          x={el.x ?? 0}
          y={el.y ?? 0}
          fontSize={Math.max(12, el.width * 5)}
          fill={el.color}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {el.text || ''}
        </text>
      );
    case 'clear':
      return null;
    default:
      return null;
  }
}

export default function CallWhiteboard({ token, currentUser, onClose, boardId, title }: CallWhiteboardProps) {
  const myId = currentUser?.id || 'anon';

  const [sessionId, setSessionId] = useState<string | null>(boardId || null);
  const [sessionTitle, setSessionTitle] = useState<string>(title || 'Shared Whiteboard');
  const [elements, setElements] = useState<WBElement[]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>('#111111');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [drawing, setDrawing] = useState<WBElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(!boardId);

  const svgRef = useRef<SVGSVGElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const drawingRef = useRef<WBElement | null>(null);
  const sessionIdRef = useRef<string | null>(sessionId);
  const elementsRef = useRef<WBElement[]>([]);
  const patternId = useMemo(() => `wb-grid-${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { elementsRef.current = elements; }, [elements]);

  const toast = useCallback((message: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  }, []);

  const api = useCallback(async (path: string, method = 'POST', body?: any) => {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  }, [token]);

  // Create a session when no boardId was provided.
  useEffect(() => {
    if (boardId) return;
    if (!token) {
      setCreating(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/whiteboard/session', 'POST', { title: title || 'Shared Whiteboard' });
        if (!cancelled && data.session) {
          setSessionId(data.session.id);
          setSessionTitle(data.session.title || title || 'Shared Whiteboard');
        }
      } catch (e: any) {
        if (!cancelled) {
          toast(e.message || 'Could not create whiteboard.', 'destructive');
          setCreating(false);
        }
      } finally {
        if (!cancelled) setCreating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [boardId, token, title, api, toast]);

  // Load the canonical snapshot once we know the session id.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api(`/api/whiteboard/session/${sessionId}`, 'GET');
        if (!cancelled && data.session) {
          setElements(Array.isArray(data.session.elements) ? (data.session.elements as WBElement[]) : []);
          if (data.session.title) setSessionTitle(data.session.title);
        }
      } catch (e) {
        // 404 / offline — start with an empty canvas.
        if (!cancelled) setElements([]);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, api]);

  // ---- WebSocket real-time sync (guarded: standalone still works if it fails) ----
  useEffect(() => {
    const boardIdNow = sessionId;
    if (!boardIdNow || !token || !currentUser?.id) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      let sock: WebSocket;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        sock = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
      } catch (e) {
        console.warn('Whiteboard WS connect error:', e);
        reconnectTimer = window.setTimeout(connect, 3000);
        return;
      }
      ws = sock;
      socketRef.current = sock;

      sock.onopen = () => {
        setConnected(true);
        try {
          sock.send(JSON.stringify({
            type: WB_PROTOCOL.AUTH,
            token,
            userId: currentUser.id,
            name: currentUser.name,
            username: currentUser.name,
          }));
          sock.send(JSON.stringify({ type: WB_PROTOCOL.SUBSCRIBE, boardId: boardIdNow }));
        } catch (e) {
          console.warn('Whiteboard WS handshake send failed:', e);
        }
      };

      sock.onmessage = (event) => {
        let data: any;
        try { data = JSON.parse(String(event.data)); } catch { return; }
        if (!data || typeof data !== 'object') return;
        if (data.boardId && data.boardId !== boardIdNow) return;

        if (data.type === WB_PROTOCOL.EVENT) {
          const eventEl = data.event as WBElement | undefined;
          if (!eventEl || !eventEl.id) return;
          if (data.from && currentUser.id && data.from === currentUser.id) return; // ignore own echo
          if (eventEl.tool === 'clear') {
            setElements([]);
            return;
          }
          setElements(prev => (prev.some(e => e.id === eventEl.id) ? prev : [...prev, eventEl]));
        } else if (data.type === WB_PROTOCOL.STATE) {
          if (Array.isArray(data.elements)) setElements(data.elements as WBElement[]);
        }
      };

      sock.onerror = () => { /* surfaced by onclose */ };

      sock.onclose = () => {
        setConnected(false);
        if (closed) return;
        reconnectTimer = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        try { ws.close(); } catch { /* ignore */ }
      }
      socketRef.current = null;
    };
  }, [sessionId, token, currentUser?.id]);

  // ---- broadcast one element to the room ----
  const broadcastEvent = useCallback((el: WBElement) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !sessionIdRef.current) return;
    try {
      ws.send(JSON.stringify({ type: WB_PROTOCOL.EVENT, boardId: sessionIdRef.current, event: el }));
    } catch (e) {
      console.warn('Whiteboard broadcast failed:', e);
    }
  }, []);

  const commitElement = useCallback((el: WBElement) => {
    setElements(prev => [...prev, el]);
    broadcastEvent(el);
  }, [broadcastEvent]);

  // ---- drawing helpers ----
  const toBoard = useCallback((e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    const x = Math.max(0, Math.min(BOARD_W, ((e.clientX - rect.left) / rect.width) * BOARD_W));
    const y = Math.max(0, Math.min(BOARD_H, ((e.clientY - rect.top) / rect.height) * BOARD_H));
    return { x, y };
  }, []);

  const handleClearAll = useCallback(() => {
    if (isDrawing) return;
    const marker: WBElement = {
      id: wbUid(), tool: 'clear', color, width: 1, createdAt: Date.now(), by: myId, byName: currentUser?.name,
    };
    commitElement(marker); // render list collapses to empty; undo can pop the marker
  }, [color, currentUser?.name, isDrawing, myId, commitElement]);

  const handleUndo = useCallback(() => {
    if (drawingRef.current) return;
    setElements(prev => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].by === myId) {
          const next = prev.slice();
          next.splice(i, 1);
          return next;
        }
      }
      return prev;
    });
  }, [myId]);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const pt = toBoard(e);

    if (tool === 'text') {
      const text = window.prompt('Whiteboard text:');
      if (text && text.trim()) {
        const el: WBElement = {
          id: wbUid(), tool: 'text', color, width: strokeWidth,
          x: pt.x, y: pt.y, text: text.trim().slice(0, 200),
          createdAt: Date.now(), by: myId, byName: currentUser?.name,
        };
        commitElement(el);
      }
      return;
    }
    if (tool === 'clear') {
      handleClearAll();
      return;
    }

    e.preventDefault();
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const base = {
      id: wbUid(),
      color: tool === 'eraser' ? '#ffffff' : color,
      width: tool === 'eraser' ? Math.max(strokeWidth * 6, 24) : strokeWidth,
      createdAt: Date.now(),
      by: myId,
      byName: currentUser?.name,
    };
    let start: WBElement;
    if (tool === 'pen' || tool === 'eraser') {
      start = { ...base, tool, points: [[pt.x, pt.y]] };
    } else {
      start = { ...base, tool, x: pt.x, y: pt.y, x2: pt.x, y2: pt.y };
    }
    drawingRef.current = start;
    setDrawing(start);
    setIsDrawing(true);
  }, [tool, color, strokeWidth, myId, currentUser?.name, toBoard, commitElement, handleClearAll]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const cur = drawingRef.current;
    if (!cur) return;
    const pt = toBoard(e);
    const next: WBElement =
      cur.tool === 'pen' || cur.tool === 'eraser'
        ? { ...cur, points: [...(cur.points || []), [pt.x, pt.y] as [number, number]] }
        : { ...cur, x2: pt.x, y2: pt.y };
    drawingRef.current = next;
    setDrawing(next);
  }, [toBoard]);

  const finishStroke = useCallback(() => {
    const el = drawingRef.current;
    drawingRef.current = null;
    setDrawing(null);
    setIsDrawing(false);
    if (!el) return;
    if (el.tool === 'pen' || el.tool === 'eraser') {
      if (!el.points || el.points.length < 2) return; // stray click
    } else if (Math.abs((el.x2 ?? el.x ?? 0) - (el.x ?? 0)) < 2 && Math.abs((el.y2 ?? el.y ?? 0) - (el.y ?? 0)) < 2) {
      return; // degenerate shape
    }
    commitElement(el);
  }, [commitElement]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    finishStroke();
  }, [finishStroke]);

  const handlePointerCancel = useCallback(() => {
    drawingRef.current = null;
    setDrawing(null);
    setIsDrawing(false);
  }, []);

  const handleSave = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    setSaving(true);
    try {
      await api(`/api/whiteboard/session/${id}/elements`, 'POST', {
        elements: elementsRef.current,
        width: BOARD_W,
        height: BOARD_H,
      });
      toast('Whiteboard saved.');
    } catch (e: any) {
      toast(e.message || 'Save failed.', 'destructive');
    } finally {
      setSaving(false);
    }
  }, [api, toast]);

  const handleClose = useCallback(async () => {
    const id = sessionIdRef.current;
    if (id && currentUser?.id) {
      try { await api(`/api/whiteboard/session/${id}/close`, 'POST'); } catch { /* non-creator 403 — just leave */ }
    }
    onClose();
  }, [api, currentUser?.id, onClose]);

  const renderList = useMemo(() => computeRenderList(elements), [elements]);
  const cursor = tool === 'text' ? 'text' : 'crosshair';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4"
    >
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header + toolbar */}
        <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-[#3a342a]/10 flex items-center justify-center shrink-0">
              <Grid3x3 className="text-[#3a342a] dark:text-zinc-300" size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-base font-bold text-[#3a342a] dark:text-zinc-100 truncate">
                {sessionTitle}
              </h2>
              <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                {connected ? 'Live — synced' : 'Local only'}
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !sessionId}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
            >
              <Save size={11} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleClose}
              className="w-9 h-9 rounded-full bg-[#ebdcca]/40 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 dark:hover:bg-zinc-700 flex items-center justify-center shrink-0"
              title="Close whiteboard"
            >
              <X size={15} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {TOOLS.map(t => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-mono text-[9px] uppercase font-bold tracking-wider transition-all ${
                  tool === t.id
                    ? 'bg-[#3a342a] text-[#f4f1ea]'
                    : 'bg-[#ebdcca]/40 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-300 hover:bg-[#ebdcca]/70'
                }`}
              >
                <t.icon size={12} /> {t.label}
              </button>
            ))}
            <button
              onClick={handleClearAll}
              disabled={isDrawing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-mono text-[9px] uppercase font-bold tracking-wider bg-red-100/70 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-800/60 hover:bg-red-200 disabled:opacity-50 transition-all"
            >
              <Trash2 size={12} /> Clear all
            </button>

            <span className="mx-1 h-5 w-px bg-[#ebdcca] dark:bg-zinc-700" />

            {SWATCHES.map(s => (
              <button
                key={s.value}
                onClick={() => setColor(s.value)}
                title={s.label}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  color === s.value ? 'border-[#3a342a] dark:border-zinc-300' : 'border-[#ebdcca] dark:border-zinc-700'
                }`}
                style={{ background: s.value }}
              />
            ))}

            <span className="mx-1 h-5 w-px bg-[#ebdcca] dark:bg-zinc-700" />

            <select
              value={strokeWidth}
              onChange={e => setStrokeWidth(Number(e.target.value))}
              className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-1.5 text-xs text-[#3a342a] dark:text-zinc-100 font-mono outline-none"
              title="Stroke width"
            >
              {STROKE_WIDTHS.map(w => <option key={w} value={w}>{w}px</option>)}
            </select>

            <button
              onClick={handleUndo}
              disabled={elements.length === 0 || isDrawing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-mono text-[9px] uppercase font-bold tracking-wider bg-white border border-[#cfcac0] dark:border-zinc-700 text-[#3a342a] dark:text-zinc-200 hover:bg-[#ebdcca]/30 disabled:opacity-50 transition-all"
            >
              <Undo2 size={12} /> Undo
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-3 overflow-hidden">
          {creating ? (
            <div className="h-64 flex items-center justify-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172]">
              Creating whiteboard…
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
              className="w-full h-auto rounded-xl touch-none select-none"
              style={{ background: '#ffffff', cursor }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onPointerLeave={handlePointerUp}
            >
              <defs>
                <pattern id={patternId} width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1.2" cy="1.2" r="1.2" fill="#e6e2d9" />
                </pattern>
              </defs>
              <rect width={BOARD_W} height={BOARD_H} fill={`url(#${patternId})`} />
              {renderList.map(el => renderElement(el))}
              {drawing && renderElement(drawing)}
            </svg>
          )}
        </div>

        <p className="text-center font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
          The creator's Save button persists the board — everyone reloads the same snapshot.
        </p>
      </div>
    </motion.div>
  );
}
