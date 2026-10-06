import type { AdminSectionInfo } from '@/lib/cms/admin-sections';

/** FAZ 3A: her admin bölümü için yer tutucu. Gerçek editörler FAZ 3B+ ile gelir. */
export default function AdminPlaceholder({ section }: { section: AdminSectionInfo }) {
  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-muted">FAZ {section.phase} — PLANLANDI</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">{section.label}</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">{section.description}. Bu bölüm henüz etkin değil; site içeriği şimdilik dosya tabanlı kaynaktan yayınlanıyor.</p>
      <h2 className="mt-10 font-mono text-xs font-normal tracking-widest text-muted">PLANLANAN</h2>
      <ul className="mt-3 max-w-xl divide-y divide-fg/15 border-y border-fg/15">
        {section.planned.map((item) => (
          <li key={item} className="py-3">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
