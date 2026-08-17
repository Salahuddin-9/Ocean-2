import { FlaskConical } from 'lucide-react';

/**
 * Ocean — Simulation Mode badge
 * -----------------------------
 * Shared disclosure for features that cannot work for real without external
 * hardware or third-party infrastructure (satellite uplinks, hardware wallets,
 * zk-SNARK verifiers, remote ActivityPub servers…). The feature runs a
 * faithful simulated/queued version in-app; this badge makes that explicit and
 * documents the real-world requirement so nobody mistakes the demo for the
 * production system.
 */

interface SimulationModeBadgeProps {
  /** One-line headline, e.g. "No satellite hardware connected". */
  title: string;
  /** Real-world limitation + what a production build would need. */
  detail: string;
}

export default function SimulationModeBadge({ title, detail }: SimulationModeBadgeProps) {
  return (
    <div className="rounded-2xl border border-amber-300/70 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-950/30 p-3">
      <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-amber-800 dark:text-amber-300 font-bold mb-1">
        <FlaskConical size={11} /> Simulation mode — {title}
      </p>
      <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 leading-relaxed">{detail}</p>
    </div>
  );
}
