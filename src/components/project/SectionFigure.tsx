import Image from 'next/image';
import type { CaseFigure } from '@/types';
import { figureSrc } from '@/lib/media/public-url';

/**
 * Bölümün gerçek ürün görseli: `<figure>` + `next/image` (WebP optimizasyonu, `width/height` ile CLS yok, `sizes`, lazy).
 * `priority` KULLANILMAZ: sayfanın LCP adayı hero metnidir. Adres güvenli üreticiden gelmezse (ortam yok/yol geçersiz) hiçbir şey render edilmez.
 */
export default function SectionFigure({ figure }: { figure: CaseFigure }) {
  const src = figureSrc(figure.path);
  if (!src) return null;
  return (
    <figure className="mb-8 sm:mb-10">
      <div className="overflow-hidden rounded-2xl border border-fg/15 bg-fg/5">
        <Image
          src={src}
          alt={figure.alt}
          width={figure.width}
          height={figure.height}
          sizes="(min-width: 1024px) 56vw, 100vw"
          loading="lazy"
          className="h-auto w-full"
        />
      </div>
      {figure.caption && <figcaption className="mt-3 font-mono text-xs leading-relaxed tracking-wide text-muted">{figure.caption}</figcaption>}
    </figure>
  );
}
