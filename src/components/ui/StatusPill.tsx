import type { Accent } from '@/types';
import { dotClass } from '@/lib/accent';
import { cn } from '@/lib/cn';

export default function StatusPill({ label, accent }: { label: string; accent: Accent }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="relative flex h-2.5 w-2.5" aria-hidden>
        <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping', dotClass[accent])} />
        <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', dotClass[accent])} />
      </span>
      <span className="font-mono text-xs tracking-widest">{label}</span>
    </span>
  );
}
