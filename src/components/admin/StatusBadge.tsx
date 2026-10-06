import type { LifecycleTone } from '@/lib/cms/admin/lifecycle';

const DOT: Record<LifecycleTone, string> = { live: 'bg-acid', pending: 'bg-hot', draft: 'bg-fg/30' };

export default function StatusBadge({ label, tone }: { label: string; tone: LifecycleTone }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-widest">
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[tone]}`} />
      {label}
    </span>
  );
}
