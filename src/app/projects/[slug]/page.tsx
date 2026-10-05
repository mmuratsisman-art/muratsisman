import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { projects } from '@/data/projects';

export function generateStaticParams() {
  return projects.filter((p) => !p.comingSoon).map((p) => ({ slug: p.slug }));
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug && !p.comingSoon);
  if (!project) notFound();

  return (
    <section className="shell py-16 sm:py-24" style={{ ['--card-accent' as string]: `var(--${project.accent})` }}>
      <Link href="/#projects" className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> PROJELER
      </Link>
      <h1 className="mt-8 font-display text-5xl font-extrabold leading-none sm:text-7xl">{project.title}</h1>
      <p className="mt-4 text-xl text-muted">{project.subtitle}</p>
      <p className="mt-8 max-w-xl text-lg">{project.description}</p>
      <p className="mt-10 inline-block rounded-full border border-dashed border-fg/30 px-4 py-2 font-mono text-xs tracking-widest">
        DETAY SAYFASI YAKINDA
      </p>
    </section>
  );
}
