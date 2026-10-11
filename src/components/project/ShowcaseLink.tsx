import { checkShowcaseUrl } from '@/lib/cms/validate/showcase';
import SectionShell from './SectionShell';

interface Props {
  /** `case_study.showcase.url` (kayıtta zaten doğrulanmıştır; burada savunma olarak yeniden denetlenir). */
  url: string;
  /** Üstündeki bölümle aynı ritmi sürdürmek için sayfa/önizleme tarafından hesaplanır. */
  tone: 'base' | 'alt';
  /** Yalnızca public sayfada verilir: tıklama sayacı (HitBeacon) bu veri özniteliğini okur. Görünümü ve davranışı değiştirmez. */
  slug?: string;
}

/**
 * Proje detayının sonunda isteğe bağlı harici showcase bağlantısı. Public sayfa VE admin önizlemesi bu TEK bileşeni kullanır.
 * Geçersiz/izin verilmeyen bir adres asla `href`'e girmez: bileşen hiçbir şey çizmez.
 */
export default function ShowcaseLink({ url, tone, slug }: Props) {
  const checked = checkShowcaseUrl(url);
  if (!checked.ok) return null;
  return (
    <SectionShell id="showcase" heading="EXPLORE THE INTERFACE" num="PROJECT SHOWCASE" tone={tone}>
      <p className="max-w-xl text-lg leading-snug text-muted sm:text-xl">
        Explore a visual presentation of the project interface using representative, non-production content.
      </p>
      <a
        href={checked.url}
        target="_blank"
        rel="noopener noreferrer"
        data-showcase-slug={slug}
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-acid px-7 py-4 font-semibold text-ink transition hover:-translate-y-0.5"
      >
        VIEW PROJECT SHOWCASE <span aria-hidden>↗</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </SectionShell>
  );
}
