import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Link2 } from 'lucide-react';

/**
 * Ocean — LinkPreviewCard (shared, reusable)
 * ------------------------------------------
 * Rich link preview powered by POST /api/link-preview. Also exports two
 * helpers for extracting URLs out of free text (used by ChatModal bubbles).
 *
 * Ocean palette: bg-[#fcfaf4]/zinc-900 cards, #ebdcca borders, amber accents.
 */

interface LinkPreviewCardProps {
  /** The raw http(s) URL to preview. */
  url: string;
  /** Optional auth token — /api/link-preview is public but we attach it when available. */
  token?: string | null;
  /** Compact layout: one-line title + hostname, no image/description. */
  compact?: boolean;
}

interface PreviewData {
  title: string;
  description: string;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  url: string;
}

/** Extract every http(s) URL from a block of text, trimming trailing punctuation. */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
  return matches.map(trimUrl).filter((u): u is string => Boolean(u));
}

/** True when the text contains at least one http(s) URL. */
export function hasUrl(text: string): boolean {
  return extractUrls(text).length > 0;
}

function trimUrl(raw: string): string {
  let s = raw.replace(/[.,;:!?]+$/g, '');
  const closingCount = (open: string, close: string) => {
    const opens = s.split(open).length - 1;
    const closes = s.split(close).length - 1;
    return closes > opens && s.endsWith(close);
  };
  while (s.length > 8 && (closingCount('(', ')') || closingCount('[', ']') || closingCount('{', '}'))) {
    s = s.slice(0, -1);
  }
  return s;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function resolveUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value, base);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    return null;
  } catch {
    return null;
  }
}

/** Shimmer placeholder shown while the preview request is in flight. */
function LinkPreviewSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className="border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 rounded-xl overflow-hidden animate-pulse">
      {!compact && <div className="w-full aspect-[16/7] bg-[#ebdcca]/60 dark:bg-zinc-800" />}
      <div className="p-2.5 space-y-2">
        <div className="h-2.5 rounded-full bg-[#ebdcca]/70 dark:bg-zinc-700 w-3/4" />
        <div className="h-2 rounded-full bg-[#ebdcca]/50 dark:bg-zinc-800 w-1/2" />
        <div className="h-2 rounded-full bg-[#ebdcca]/50 dark:bg-zinc-800 w-2/3" />
      </div>
    </div>
  );
}

export default function LinkPreviewCard({ url, token, compact }: LinkPreviewCardProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setPreview(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    setPreview(null);
    setImageBroken(false);

    (async () => {
      try {
        const res = await fetch('/api/link-preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
          body: JSON.stringify({ url }),
        });
        if (!res.ok) throw new Error('Preview request failed.');
        const data = await res.json();
        if (cancelled) return;
        setPreview({
          title: String(data.title || url),
          description: String(data.description || ''),
          image: resolveUrl(data.image, url),
          siteName: data.siteName ? String(data.siteName) : null,
          favicon: resolveUrl(data.favicon, url),
          url: String(data.url || url),
        });
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, token]);

  // Loading -> shimmer skeleton.
  if (loading) return <LinkPreviewSkeleton compact={compact} />;

  // Error -> collapse to a tiny muted link (never a broken block).
  if (failed || !preview) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[10px] font-mono text-[#8a8172] dark:text-zinc-500 hover:text-amber-800 dark:hover:text-amber-400 transition-colors"
      >
        <Link2 size={10} />
        {hostnameOf(url)}
      </a>
    );
  }

  const imgSrc = !imageBroken ? preview.image : null;

  return (
    <motion.a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2 }}
      className={`block overflow-hidden border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 rounded-xl hover:border-amber-300/60 dark:hover:border-amber-800 transition-colors ${compact ? 'p-2' : ''}`}
    >
      {!compact && imgSrc && (
        <div className="relative w-full aspect-[16/7] bg-[#ebdcca]/40 dark:bg-zinc-800">
          <img
            src={imgSrc}
            alt=""
            loading="lazy"
            onError={() => setImageBroken(true)}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className={compact ? 'space-y-0.5' : 'p-2.5 space-y-1'}>
        <p
          className={`text-[#3a342a] dark:text-zinc-100 leading-snug ${
            compact ? 'text-[11px] font-semibold line-clamp-1' : 'text-[10px] font-semibold line-clamp-2'
          }`}
        >
          {preview.title}
        </p>

        {!compact && preview.description && (
          <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 line-clamp-2">{preview.description}</p>
        )}

        <div className="flex items-center gap-1.5 pt-0.5 text-[9px] font-mono uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
          {preview.favicon && !compact && (
            <img
              src={preview.favicon}
              alt=""
              loading="lazy"
              className="w-3 h-3 rounded-sm"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <span className="truncate">{preview.siteName || hostnameOf(preview.url)}</span>
          <span className="opacity-70">· {hostnameOf(preview.url)}</span>
        </div>
      </div>
    </motion.a>
  );
}
