import React from 'react';
import { Hash, TrendingUp, MessageSquare, Flame } from 'lucide-react';

export interface HashtagTrendItem {
  tag: string;
  count: number;
  postsCount?: number;
  trendingScore?: number;
}

interface HashtagTrendSectionProps {
  hashtags: HashtagTrendItem[];
  searchQuery?: string;
  onSelectHashtag: (tag: string) => void;
}

// Generate deterministic trend data for sparkline SVG based on hashtag text & count
function generateTrendPoints(tag: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i);
    hash |= 0;
  }
  const points: number[] = [];
  const baseVal = Math.max(count, 8);

  for (let i = 0; i < 8; i++) {
    const rawFactor = Math.abs(Math.sin((hash + (i * 23) + 7) * 0.35));
    // Create organic dip-and-rise trend curves like real viral social analytics
    const multiplier = 0.08 + (i / 7) * 0.6 + rawFactor * 0.32;
    points.push(Math.round(baseVal * multiplier));
  }
  points[points.length - 1] = baseVal; // peak at present time
  return points;
}

// SVG Sparkline Component matching user screenshot
export const HashtagSparkline: React.FC<{ tag: string; count: number }> = ({ tag, count }) => {
  const points = generateTrendPoints(tag, count);
  const width = 110;
  const height = 36;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 10) - 5;
    return { x, y };
  });

  // Build cubic bezier curve path for ultra smooth aesthetic
  let linePath = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cx = ((prev.x + curr.x) / 2).toFixed(1);
    linePath += ` C ${cx} ${prev.y.toFixed(1)}, ${cx} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  // Unique SVG gradient ID per tag to avoid SVG ID collision
  const gradId = `sparkGrad-${tag.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg width={width} height={height} className="overflow-visible shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#84cc16" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#84cc16" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#84cc16" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke="#65a30d"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const HashtagTrendSection: React.FC<HashtagTrendSectionProps> = ({
  hashtags,
  searchQuery,
  onSelectHashtag,
}) => {
  const qClean = (searchQuery || '').toLowerCase().trim().replace(/^#/, '');

  const filtered = hashtags.filter(item => {
    if (!qClean) return true;
    return item.tag.toLowerCase().includes(qClean);
  });

  if (filtered.length === 0) {
    return (
      <div className="py-12 text-center text-[#8a8172] dark:text-zinc-400 font-mono text-xs border border-dashed border-[#ebdcca] dark:border-zinc-800 rounded-3xl bg-[#ebdcca]/5 dark:bg-zinc-900/50">
        No hashtags found matching "{searchQuery}".
      </div>
    );
  }

  return (
    <div className="space-y-1 divide-y divide-[#ebdcca]/40 dark:divide-zinc-800/60">
      {filtered.map((item, idx) => {
        const displayTag = item.tag.startsWith('#') ? item.tag : `#${item.tag}`;
        return (
          <div
            key={item.tag}
            onClick={() => onSelectHashtag(displayTag)}
            className="py-3.5 px-3 rounded-2xl hover:bg-[#ebdcca]/25 dark:hover:bg-zinc-800/60 transition-all cursor-pointer flex items-center justify-between group"
          >
            <div className="space-y-1 text-left min-w-0 pr-3">
              <div className="flex items-center gap-1.5">
                <span className="font-sans font-extrabold text-sm text-[#3a342a] dark:text-zinc-100 group-hover:text-amber-800 dark:group-hover:text-amber-400 transition-colors truncate">
                  {displayTag}
                </span>
                {idx < 3 && !qClean && (
                  <span className="inline-flex items-center gap-0.5 text-[8px] font-mono uppercase font-black bg-amber-500/15 text-amber-800 dark:text-amber-300 px-1.5 py-0.25 rounded-md border border-amber-500/30">
                    <Flame size={8} className="text-amber-600 fill-amber-500 animate-pulse" />
                    Hot
                  </span>
                )}
              </div>
              <p className="font-sans text-xs text-[#8a8172] dark:text-zinc-400 font-medium flex items-center gap-1">
                <span>{item.count} people are talking</span>
              </p>
            </div>

            {/* Sparkline Graph on Right Side */}
            <div className="flex items-center gap-2 shrink-0">
              <HashtagSparkline tag={item.tag} count={item.count} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HashtagTrendSection;
