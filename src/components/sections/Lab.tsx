import { siteConfig } from '@/data/site';
import { labCategories } from '@/data/lab';
import { dotClass } from '@/lib/accent';
import SectionHeading from '@/components/ui/SectionHeading';

// FAZ 2'de playground karakteri (interaktif denemeler) güçlendirilecek.
export default function Lab() {
  return (
    <section id="lab" aria-labelledby="lab-title" className="on-color bg-lab py-20 text-white sm:py-28">
      <div className="shell">
        <SectionHeading id="lab-title" eyebrow="MURAT/LAB" title="LAB" />
        <p className="max-w-2xl text-xl leading-snug sm:text-3xl">
          {siteConfig.lab.lines.map((l) => (
            <span key={l} className="block">{l}</span>
          ))}
        </p>
        <ul className="mt-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {labCategories.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-white/30 bg-white/10 p-4 font-semibold sm:p-5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass[c.accent]}`} aria-hidden />
              {c.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
