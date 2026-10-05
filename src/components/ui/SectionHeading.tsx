import { cn } from '@/lib/cn';

export default function SectionHeading({ id, eyebrow, title, className }: { id?: string; eyebrow?: string; title: string; className?: string }) {
  return (
    <div className={cn('mb-10 sm:mb-14', className)}>
      {eyebrow && <p className="mb-3 font-mono text-xs tracking-widest opacity-70">{eyebrow}</p>}
      <h2 id={id} className="font-display text-[clamp(2.5rem,9vw,5.5rem)] font-extrabold leading-[0.9] tracking-tight">
        {title}
      </h2>
    </div>
  );
}
