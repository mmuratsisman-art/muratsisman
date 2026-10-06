import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/data/site';
import { labEntries } from '@/data/lab';
import LabTimeline from '@/components/lab/LabTimeline';
import { pad } from '@/lib/format';

export const metadata: Metadata = {
  title: 'LAB · Experiments & Prototypes',
  description: 'MURAT/LAB: küçük deneyler, prototipler ve keşifler. Tamamlanmış projelerden ayrı, hâlâ evrilen fikirlerin alanı.',
  alternates: { canonical: '/lab' },
};

export default function LabPage() {
  const active = labEntries.filter((e) => e.status === 'ACTIVE' || e.status === 'EXPLORING').length;
  return (
    <div>
      <header className="on-color relative overflow-hidden bg-lab text-white">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[3px] border-white/25 sm:h-[26rem] sm:w-[26rem]" />
        <div aria-hidden className="pointer-events-none absolute right-16 top-44 h-5 w-5 rounded-full bg-acid sm:right-40 sm:top-56" />
        <div className="shell relative py-14 sm:py-24">
          <p className="font-mono text-xs tracking-widest text-white/90">{siteConfig.labPage.eyebrow}</p>
          <h1 className="mt-4 font-display text-[clamp(4rem,20vw,13rem)] font-extrabold leading-[0.82] tracking-tighter">LAB</h1>
          <p className="mt-8 max-w-2xl text-xl leading-snug sm:text-3xl">
            {siteConfig.lab.lines.map((l) => (
              <span key={l} className="block">{l}</span>
            ))}
          </p>
          <p className="mt-10 font-mono text-xs tracking-widest text-white/90">
            {pad(labEntries.length)} KAYIT · {pad(active)} AKTİF
          </p>
          <p className="mt-3 max-w-xl text-base text-white/90">
            {siteConfig.labPage.note}{' '}
            <Link href="/#projects" className="font-semibold underline underline-offset-4 hover:no-underline">
              {siteConfig.labPage.projectsLinkLabel}
            </Link>
            .
          </p>
        </div>
      </header>

      <section aria-label="Deney kayıtları" className="bg-bg py-16 sm:py-24">
        <div className="shell">
          <LabTimeline entries={labEntries} />
        </div>
      </section>
    </div>
  );
}
