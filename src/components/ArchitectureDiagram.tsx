export function ArchitectureDiagram() {
  return (
    <div className="my-8 p-6 bg-slate-900/80 border border-slate-700/50 rounded-2xl overflow-x-auto">
      <svg viewBox="0 0 1000 520" className="w-full max-w-4xl mx-auto" style={{ minWidth: 600 }}>
        <defs>
          <linearGradient id="grad1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="grad2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="grad3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.3" />
          </linearGradient>
          <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
          </marker>
        </defs>

        {/* Stage 1: Input Signals */}
        <rect x="20" y="20" width="200" height="480" rx="12" fill="url(#grad1)" stroke="#06b6d4" strokeOpacity="0.4" />
        <text x="120" y="52" textAnchor="middle" fill="#06b6d4" fontSize="13" fontWeight="bold">INPUT SIGNALS</text>
        
        {[
          ['W_r', 'Watch Time Ratio', 80],
          ['R_c', 'Rewatch Count', 125],
          ['E_i', 'Engagements (6)', 170],
          ['F±', 'Feedback (+/-)', 215],
          ['T_age', 'Post Age', 260],
          ['V', 'Views & Velocity', 305],
          ['A_use', 'App Conversion', 350],
          ['L, C', 'Locale Filters', 395],
          ['B_cfg', 'Boost Config', 440],
        ].map(([sym, label, y]) => (
          <g key={sym as string}>
            <rect x="35" y={(y as number) - 18} width="170" height="36" rx="8" fill="#0f172a" stroke="#334155" />
            <text x="55" y={y as number} fill="#94a3b8" fontSize="10" fontFamily="monospace">{sym as string}</text>
            <text x="100" y={y as number} fill="#e2e8f0" fontSize="10">{label as string}</text>
          </g>
        ))}

        {/* Arrow 1→2 */}
        <line x1="220" y1="260" x2="270" y2="260" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrow)" />

        {/* Stage 2: Processing */}
        <rect x="280" y="20" width="200" height="480" rx="12" fill="url(#grad2)" stroke="#8b5cf6" strokeOpacity="0.4" />
        <text x="380" y="52" textAnchor="middle" fill="#8b5cf6" fontSize="13" fontWeight="bold">SCORING ENGINE</text>

        {[
          ['σ(W_r)', 'Sigmoid Scale', 80],
          ['σ(R_c)', 'Rewatch Scale', 125],
          ['Σα_iE_i', 'Weighted Engage', 170],
          ['β·F', 'Feedback Score', 215],
          ['e^(-λt)', 'Decay Function', 260],
          ['δ·log(V)', 'Velocity Score', 305],
          ['ε·A', 'Conversion Wt', 350],
          ['Hard/Soft', 'Locale Filter', 395],
          ['B_factor', 'Boost Multiply', 440],
        ].map(([sym, label, y]) => (
          <g key={sym as string}>
            <rect x="295" y={(y as number) - 18} width="170" height="36" rx="8" fill="#0f172a" stroke="#334155" />
            <text x="315" y={y as number} fill="#c4b5fd" fontSize="10" fontFamily="monospace">{sym as string}</text>
            <text x="370" y={y as number} fill="#e2e8f0" fontSize="10">{label as string}</text>
          </g>
        ))}

        {/* Arrow 2→3 */}
        <line x1="480" y1="260" x2="530" y2="260" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrow)" />

        {/* Stage 3: Aggregation */}
        <rect x="540" y="100" width="200" height="320" rx="12" fill="url(#grad3)" stroke="#10b981" strokeOpacity="0.4" />
        <text x="640" y="132" textAnchor="middle" fill="#10b981" fontSize="13" fontWeight="bold">AGGREGATION</text>

        {[
          ['P(W_r)×', 'Bounce Penalty', 170],
          ['Σ scores', 'Raw Composite', 220],
          ['× B_fac', 'Boost Apply', 270],
          ['norm()', 'Normalize 0-100', 320],
          ['sort()', 'Rank Descending', 370],
        ].map(([sym, label, y]) => (
          <g key={sym as string}>
            <rect x="555" y={(y as number) - 18} width="170" height="36" rx="8" fill="#0f172a" stroke="#334155" />
            <text x="575" y={y as number} fill="#6ee7b7" fontSize="10" fontFamily="monospace">{sym as string}</text>
            <text x="630" y={y as number} fill="#e2e8f0" fontSize="10">{label as string}</text>
          </g>
        ))}

        {/* Arrow 3→4 */}
        <line x1="740" y1="260" x2="790" y2="260" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrow)" />

        {/* Stage 4: Output */}
        <rect x="800" y="160" width="180" height="200" rx="12" fill="#0f172a" stroke="#f59e0b" strokeOpacity="0.4" />
        <text x="890" y="192" textAnchor="middle" fill="#f59e0b" fontSize="13" fontWeight="bold">OUTPUT</text>
        
        <text x="890" y="230" textAnchor="middle" fill="#e2e8f0" fontSize="11">Ranked Feed</text>
        <text x="890" y="255" textAnchor="middle" fill="#94a3b8" fontSize="10">ScoredPost[]</text>
        
        <rect x="825" y="275" width="130" height="30" rx="6" fill="#1e293b" stroke="#334155" />
        <text x="890" y="294" textAnchor="middle" fill="#06b6d4" fontSize="10">#1 Score: 87.3</text>
        
        <rect x="825" y="310" width="130" height="30" rx="6" fill="#1e293b" stroke="#334155" />
        <text x="890" y="329" textAnchor="middle" fill="#8b5cf6" fontSize="10">#2 Score: 72.1</text>

        {/* Platform weights */}
        <g>
          <rect x="540" y="435" width="200" height="55" rx="8" fill="#0f172a" stroke="#334155" />
          <text x="640" y="455" textAnchor="middle" fill="#94a3b8" fontSize="10">Platform Weights</text>
          <text x="640" y="475" textAnchor="middle" fill="#06b6d4" fontSize="11" fontFamily="monospace">IG:50% YT:25% TT:25%</text>
        </g>
      </svg>
    </div>
  );
}
