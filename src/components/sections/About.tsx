import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getSiteContent } from '@/lib/content';
import SectionHeading from '@/components/ui/SectionHeading';
import { ABOUT_AREAS, ABOUT_EYEBROW, ABOUT_LINKS, ABOUT_SLOGAN, aboutParagraphs } from './about-content';
import AboutVisual from './AboutVisual';

/** Başlık ve giriş metni CMS'ten (`about.title`, `about.text`); çalışma alanları, slogan ve bağlantılar `about-content.ts` içinde. */
export default async function About() {
  const { siteConfig } = await getSiteContent();
  const [lead, ...rest] = aboutParagraphs(siteConfig.about.text);
  return (
    <section id="about" aria-labelledby="about-title" className="bg-surface2 py-20 sm:py-28">
      <div className="shell">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <SectionHeading id="about-title" eyebrow={ABOUT_EYEBROW} title={siteConfig.about.title} className="mb-8 sm:mb-8" />
            {lead && <p className="max-w-2xl text-2xl font-semibold leading-snug sm:text-3xl">{lead}</p>}
            {rest.map((p) => (
              <p key={p} className="mt-5 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">{p}</p>
            ))}
          </div>
          <AboutVisual className="lg:col-span-5" />
        </div>

        <div className="mt-16 grid gap-12 sm:mt-20 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <h3 className="sr-only">Çalışma alanları</h3>
            <dl className="border-b border-fg/20">
              {ABOUT_AREAS.map((a) => (
                <div key={a.label} className="grid gap-1 border-t border-fg/20 py-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-baseline sm:gap-6">
                  <dt className="font-mono text-xs font-medium tracking-widest">{a.label}</dt>
                  <dd className="text-lg leading-snug sm:text-xl">{a.text}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="lg:col-span-5">
            <p className="font-display text-[clamp(2.25rem,6vw,3.5rem)] font-extrabold leading-[1.05] tracking-tighter">
              {ABOUT_SLOGAN.lead}{' '}
              <span className="box-decoration-clone bg-acid px-2 text-ink">{ABOUT_SLOGAN.accent}</span>
            </p>
            <p className="mt-4 text-lg text-muted">{ABOUT_SLOGAN.note}</p>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-5">
          <Link
            href={ABOUT_LINKS[0].href}
            className="inline-flex items-center gap-2 rounded-full border border-fg/30 px-6 py-3.5 font-semibold transition hover:border-fg hover:bg-fg/5"
          >
            {ABOUT_LINKS[0].label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href={ABOUT_LINKS[1].href}
            className="py-2 font-semibold underline decoration-electric decoration-2 underline-offset-4 transition-colors hover:decoration-fg"
          >
            {ABOUT_LINKS[1].label}
          </Link>
        </div>
      </div>
    </section>
  );
}
