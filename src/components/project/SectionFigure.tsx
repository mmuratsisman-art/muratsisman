import Image from 'next/image';
import type { CaseFigure } from '@/types';
import { figureSrc } from '@/lib/media/public-url';
import FigureLightbox from './FigureLightbox';

/**
 * Bölümün gerçek ürün görseli: `<figure>` + `next/image` (WebP optimizasyonu, `width/height` ile CLS yok, `sizes`, lazy).
 * `priority` KULLANILMAZ: sayfanın LCP adayı hero metnidir. Adres güvenli üreticiden gelmezse (ortam yok/yol geçersiz) hiçbir şey render edilmez.
 * Server Component kalır: yalnızca tıklayınca büyütme etkileşimi `FigureLightbox` (Client Component) içindedir; küçük görsel sunucuda render edilip ona `children` olarak verilir.
 */
export default function SectionFigure({ figure }: { figure: CaseFigure }) {
  const src = figureSrc(figure.path);
  if (!src) return null;
  return (
    <figure className="mb-8 sm:mb-10">
      <div className="overflow-hidden rounded-2xl border border-fg/15 bg-fg/5">
        <FigureLightbox src={src} alt={figure.alt} width={figure.width} height={figure.height} caption={figure.caption}>
          <Image
            src={src}
            alt={figure.alt}
            width={figure.width}
            height={figure.height}
            sizes="(min-width: 1024px) 56vw, 100vw"
            loading="lazy"
            className="h-auto w-full"
          />
        </FigureLightbox>
      </div>
      {figure.caption && <figcaption className="mt-3 font-mono text-xs leading-relaxed tracking-wide text-muted">{figure.caption}</figcaption>}
    </figure>
  );
}
