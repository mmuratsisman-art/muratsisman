import { Fragment } from 'react';
import type { FeaturedCaseData } from '@/types';
import { accentStyle } from '@/lib/accent';
import SectionShell from './SectionShell';
import SectionBody from './SectionBody';
import FlowDiagram from './FlowDiagram';
import TagList from './TagList';

export default function FeaturedCase({ c }: { c: FeaturedCaseData }) {
  return (
    <section id={c.id} aria-labelledby={`${c.id}-title`} className="bg-projects py-16 sm:py-24" style={accentStyle(c.accent)}>
      <div className="shell">
        <p className="font-mono text-xs tracking-widest text-muted">FEATURED CASE</p>
        <p className="mt-3 inline-block rounded-full border border-fg/30 px-3 py-1 font-mono text-[11px] tracking-widest">{c.typeLabel}</p>
        <h2
          id={`${c.id}-title`}
          className="mt-5 font-display text-[clamp(2.5rem,12vw,8rem)] font-extrabold leading-[0.85] tracking-tighter"
        >
          {c.name}
        </h2>
        {c.summary && <p className="mt-6 max-w-2xl text-xl leading-snug sm:text-2xl">{c.summary}</p>}
      </div>

      <div className="mt-8">
        {c.sections.map((s) => (
          <Fragment key={s.id}>
            <SectionShell id={`${c.id}-${s.id}`} heading={s.heading} as="h3" tone="plain">
              <SectionBody section={s} />
            </SectionShell>
            {c.diagramAfter === s.id && <FlowDiagram diagram={c.diagram} id={`${c.id}-flow`} as="h3" embedded />}
          </Fragment>
        ))}
      </div>

      <div className="shell mt-6">
        <TagList tags={c.tags} />
        {c.note && <p className="mt-6 max-w-2xl font-mono text-[11px] leading-relaxed tracking-wider text-muted">{c.note}</p>}
      </div>
    </section>
  );
}
