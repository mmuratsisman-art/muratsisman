'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Maximize2, X } from 'lucide-react';

/**
 * Proje görselini büyüten Lightbox (yalnızca kullanıcı etkileşimiyle açılır). Etkileşimli kısım budur; bölüm görseli bileşeni Server Component kalır.
 *
 * - Native `<dialog>` + `showModal()`: üst katman, arka planın etkisizleşmesi, odak tuzağı ve Escape ile kapanma tarayıcıdan gelir (özel focus trap YOK).
 * - `src` yalnızca sunucu bileşeninden, `figureSrc()` ile doğrulanmış olarak gelir; burada URL ÜRETİLMEZ. `next.config` `remotePatterns` ikinci savunmadır.
 * - Büyük görsel YALNIZCA açıkken mount edilir: kapalıyken ek istek ve ek HTML yoktur. `priority` kullanılmaz.
 * - `showModal` desteklenmiyorsa aynı doğrulanmış adres yeni sekmede (`noopener`) açılır.
 * - Animasyon yoktur (prefers-reduced-motion ile uyumlu).
 */
interface Props {
  /** `figureSrc()` çıktısı (doğrulanmış public adres). */
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  /** Sayfadaki küçük görsel (sunucuda render edilen `next/image`). */
  children: ReactNode;
}

/* ───── Sayfa kaydırma kilidi: birden çok Lightbox aynı sayfada olabilir → sayaç + ilk kilitte önceki inline değerler saklanır ───── */
let lockCount = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

function lockScroll() {
  lockCount += 1;
  if (lockCount > 1) return;
  const el = document.documentElement;
  saved = { overflow: el.style.overflow, paddingRight: el.style.paddingRight };
  const gap = window.innerWidth - el.clientWidth; // kaydırma çubuğu genişliği (kilitlenince oluşacak kayma telafisi)
  el.style.overflow = 'hidden';
  if (gap > 0) el.style.paddingRight = `${(parseFloat(getComputedStyle(el).paddingRight) || 0) + gap}px`;
}

function unlockScroll() {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;
  const el = document.documentElement;
  if (saved) {
    el.style.overflow = saved.overflow;
    el.style.paddingRight = saved.paddingRight;
  }
  saved = null;
}

export default function FigureLightbox({ src, alt, width, height, caption, children }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const downOnBackdrop = useRef(false);
  const upOnBackdrop = useRef(false);
  const captionId = useId();

  // Açılış: içerik mount edildikten sonra modal olarak göster, kaydırmayı kilitle, odağı kapat düğmesine ver.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();
    lockScroll();
    // Temizlik yalnızca kilidi bırakır: dialog'u kapatmak olay üretir (StrictMode'da yeniden açılışı bozabilir); kaldırılan öğe zaten üst katmandan çıkar.
    return unlockScroll;
  }, [open]);

  const openLightbox = () => {
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== 'function') {
      window.open(src, '_blank', 'noopener,noreferrer'); // desteklemeyen tarayıcı: doğrulanmış adres yeni sekmede
      return;
    }
    setOpen(true);
  };

  // Escape ve close() sonrası: durumu eşitle; odağı tetikleyiciye geri ver (Safari/Firefox tıklamada düğmeyi odaklamaz, bu yüzden açıkça).
  const onClose = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openLightbox}
        aria-haspopup="dialog"
        aria-label={`Görseli büyüt: ${alt}`}
        className="group relative block w-full cursor-zoom-in focus-visible:outline-offset-[-3px]"
      >
        {children}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-ink/70 text-white opacity-90 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
        >
          <Maximize2 className="h-4 w-4" />
        </span>
      </button>

      <dialog
        ref={dialogRef}
        onClose={onClose}
        aria-labelledby={open && caption ? captionId : undefined}
        aria-label={open && !caption ? `Büyütülmüş görsel: ${alt}` : undefined}
        className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-ink/95 p-0 text-white backdrop:bg-ink/90 [--lb-h:100vh] [@supports(height:100dvh)]:[--lb-h:100dvh]"
      >
        {open && (
          <div
            // Arka plan: yalnızca basma VE bırakma boş alanda olursa kapanır. `click` hedefi, basma ve bırakma farklı öğelerdeyse ORTAK ATA olur;
            // bu yüzden iki ucu ayrı ayrı izlenir (görselde başlayıp dışarıda biten ya da tersi sürükleme kapatmaz).
            onPointerDown={(e) => {
              downOnBackdrop.current = e.target === e.currentTarget;
              upOnBackdrop.current = false;
            }}
            onPointerUp={(e) => {
              upOnBackdrop.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
              if (downOnBackdrop.current && upOnBackdrop.current && e.target === e.currentTarget) dialogRef.current?.close();
              downOnBackdrop.current = false;
              upOnBackdrop.current = false;
            }}
            className="flex h-full w-full flex-col items-center justify-center overflow-auto overscroll-contain p-4 [touch-action:pinch-zoom_pan-x_pan-y] sm:p-8"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Kapat"
              className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-10 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <Image
              src={src}
              alt={alt}
              width={width}
              height={height}
              sizes="100vw"
              loading="eager"
              className={`h-auto w-auto max-w-full rounded-lg object-contain ${caption ? 'max-h-[calc(var(--lb-h)-9rem)]' : 'max-h-[calc(var(--lb-h)-5rem)]'}`}
            />
            {caption && (
              <p id={captionId} className="mt-4 max-w-prose text-center font-mono text-xs leading-relaxed tracking-wide text-white/80 sm:text-sm">
                {caption}
              </p>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
