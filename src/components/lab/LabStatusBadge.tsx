import type { Accent, LabStatus } from '@/types';
import { dotClass } from '@/lib/accent';
import { cn } from '@/lib/cn';

export const labStatusAccent: Record<LabStatus, Accent> = {
  ACTIVE: 'green',
  EXPLORING: 'purple',
  PAUSED: 'orange',
  ARCHIVED: 'blue',
};

/** Durum noktası: yalnızca ACTIVE / EXPLORING "canlı" nabız atar. */
export default function LabStatusBadge({ status, onColor = false }: { status: LabStatus; onColor?: boolean }) {
  const live = status === 'ACTIVE' || status === 'EXPLORING';
  const dot = dotClass[labStatusAccent[status]];
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-widest">
      <span className="relative flex h-2.5 w-2.5" aria-hidden>
        {live && <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping', dot)} />}
        <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', dot, onColor && 'ring-1 ring-white/80')} />
      </span>
      {status}
    </span>
  );
}
