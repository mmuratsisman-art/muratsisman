import Link from 'next/link';
import { SOURCE_LABEL, UNSAVED_NOTE, type PreviewMeta } from '@/lib/cms/preview/common';

interface Props {
  /** "Proje", "Lab girdisi", "Not", "Site belgesi" */
  entityLabel: string;
  backHref: string;
  backLabel: string;
  meta: PreviewMeta | null;
  /** Taslak/yayın dışı uyarılar (yayınlama için eksikler vb.) */
  warnings?: string[];
}

/**
 * Önizleme çerçevesi: kolay fark edilir ama sayfa tasarımını bozmayan, üstte yapışık ince şerit + (varsa) uyarılar.
 * Tüm metinler React tarafından kaçışlanır; HTML enjekte edilmez.
 */
export default function PreviewBar({ entityLabel, backHref, backLabel, meta, warnings = [] }: Props) {
  return (
    <div className="relative border-b-2 border-ink bg-acid text-ink" role="region" aria-label="Önizleme durumu">
      <div className="shell flex flex-wrap items-center gap-x-4 gap-y-1 py-2 font-mono text-[11px] font-semibold tracking-widest">
        <span className="rounded-full bg-ink px-3 py-1 text-acid">ÖNİZLEME — YAYINDA DEĞİL</span>
        <span>{entityLabel.toUpperCase()}</span>
        {meta && <span className="font-normal normal-case tracking-normal">{SOURCE_LABEL[meta.source]} · {meta.lifecycleLabel}</span>}
        <Link href={backHref} className="ml-auto underline underline-offset-4 hover:no-underline">
          ← {backLabel}
        </Link>
      </div>
      <div className="shell pb-2 font-mono text-[11px] font-normal normal-case tracking-normal">
        <p>{UNSAVED_NOTE}</p>
        {meta?.stale && (
          <p role="alert" className="mt-1 font-semibold">
            Bu taslak, yayındaki sürüm sonradan değiştiği için eski bir sürüme dayanıyor ve yayınlanamaz.
          </p>
        )}
        {warnings.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer font-semibold">Yayınlama için eksikler / uyarılar ({warnings.length})</summary>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {/* Kaydırırken de görünen küçük rozet (yapışkan başlıklarla çakışmaması için köşede) */}
      <span aria-hidden className="pointer-events-none fixed bottom-4 left-4 z-50 rounded-full bg-ink px-3 py-1.5 font-mono text-[11px] font-semibold tracking-widest text-acid shadow-lg">
        ÖNİZLEME — YAYINDA DEĞİL
      </span>
    </div>
  );
}
