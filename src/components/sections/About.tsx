import { siteConfig } from '@/data/site';
import SectionHeading from '@/components/ui/SectionHeading';

// FAZ 2: gerçek fotoğraf / kariyer timeline'ı.
export default function About() {
  return (
    <section id="about" aria-labelledby="about-title" className="bg-surface2 py-20 sm:py-28">
      <div className="shell grid items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading id="about-title" title={siteConfig.about.title} className="mb-8 sm:mb-8" />
          <p className="max-w-lg text-xl leading-snug sm:text-2xl">{siteConfig.about.text}</p>
        </div>
        <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-[2rem] border border-fg/15 bg-surface" role="img" aria-label="Fotoğraf için ayrılmış yaratıcı alan">
          <div className="absolute -left-10 top-10 h-48 w-48 rounded-full bg-electric" />
          <div className="absolute -right-8 bottom-24 h-40 w-40 rounded-full bg-hot" />
          <div className="absolute bottom-10 left-10 h-24 w-24 rotate-12 rounded-2xl bg-acid" />
          <div className="absolute right-10 top-8 h-16 w-16 rounded-full border-4 border-volt" />
          <p className="absolute inset-x-0 bottom-4 text-center font-mono text-[11px] tracking-widest text-ink">FOTOĞRAF İÇİN AYRILDI</p>
        </div>
      </div>
    </section>
  );
}
