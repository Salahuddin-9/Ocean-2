import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

interface FeatureShellProps {
  title: string;
  badge?: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/** Shared full-screen overlay shell used by every new Ocean Pack feature view. */
export default function FeatureShell({ title, badge, icon, onClose, children }: FeatureShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4"
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">{title}</h2>
            {badge && (
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">
                {badge}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </motion.div>
  );
}

export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg } }));
}

export function authHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
