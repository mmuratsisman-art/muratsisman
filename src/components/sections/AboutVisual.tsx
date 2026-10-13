import Image from 'next/image';
import { cn } from '@/lib/cn';
import { ABOUT_PHOTO } from './about-content';

/**
 * Hakkımda görseli. Fotoğraf tanımlıysa (`ABOUT_PHOTO`) aynı 4:5 çerçevede gösterilir; yoksa geometrik marka kompozisyonu.
 * Kompozisyon süslemedir: ekran okuyuculardan gizlenir, bilgi taşımadığı için mobilde gösterilmez. Animasyon yoktur.
 */
export default function AboutVisual({ className }: { className?: string }) {
  if (ABOUT_PHOTO) {
    return (
      <div className={cn('relative mx-auto aspect-[4/5] w-full max-w-[16rem] overflow-hidden rounded-[2rem] border border-fg/15 lg:mx-0 lg:max-w-sm', className)}>
        <Image src={ABOUT_PHOTO.src} alt={ABOUT_PHOTO.alt} width={ABOUT_PHOTO.width} height={ABOUT_PHOTO.height} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn('relative mx-auto hidden aspect-[4/5] w-full max-w-sm overflow-hidden rounded-[2rem] border border-fg/15 bg-ink lg:mx-0 lg:block', className)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.14)_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute -left-14 top-10 h-56 w-56 rounded-full bg-electric" />
      <div className="absolute bottom-16 right-10 h-28 w-28 rounded-full border-4 border-white/30" />
      <div className="absolute right-12 top-12 h-14 w-14 rotate-12 rounded-2xl border-4 border-electric" />
      <div className="absolute left-[54%] top-[10%] h-[80%] w-4 rotate-[18deg] rounded-full bg-acid" />
    </div>
  );
}
