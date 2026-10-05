import { currently } from '@/data/currently';
import StatusPill from '@/components/ui/StatusPill';
import SectionHeading from '@/components/ui/SectionHeading';

export default function Currently() {
  return (
    <section id="currently" aria-labelledby="currently-title" className="bg-bg py-16 sm:py-24">
      <div className="shell">
        <SectionHeading id="currently-title" eyebrow="CURRENTLY / 2026" title="Şu an" />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {currently.map((item, i) => (
            <li
              key={item.id}
              className={`rounded-2xl border border-fg/15 bg-surface p-5 sm:p-6 ${i % 2 ? 'lg:translate-y-6' : ''}`}
            >
              <StatusPill label={item.label} accent={item.accent} />
              <p className="mt-6 font-display text-2xl font-bold leading-tight">{item.value}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
