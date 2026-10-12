import Link from 'next/link';
import { getSiteContent } from '@/lib/content';
import { FOOTER_EMAIL, FOOTER_NAV, usableSocialLinks, type FooterSocial } from './footer-links';

/**
 * CMS'ten sosyal bağlantıları okur. Okunamazsa (cms modu fail-closed fırlatır) footer YİNE render olur:
 * 404 ve hata sayfaları da bu footer'ı kullanır, sosyal bağlantılar yüzünden çökmemeli.
 */
async function loadSocial(): Promise<FooterSocial[]> {
  try {
    const { socialLinks } = await getSiteContent();
    return usableSocialLinks(socialLinks);
  } catch {
    return [];
  }
}

const linkCls =
  'inline-block py-2 text-base text-white/80 underline-offset-4 transition-colors hover:text-acid hover:underline';
const headCls = 'font-mono text-xs font-medium uppercase tracking-[0.2em] text-white/60';

export default async function Footer({
  name,
  domain,
  brand = { left: 'MURAT', right: 'LAB' },
}: {
  name: string;
  domain: string;
  brand?: { left: string; right: string };
}) {
  const social = await loadSocial();
  return (
    // Sabit koyu zemin (iki temada da): tema değişkenlerine değil marka rengine (ink) bağlı. on-color: odak halkası beyaz.
    <footer className="on-color overflow-hidden border-t border-white/10 bg-ink text-white">
      <div className="shell pt-16 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-6">
            <p className="font-display text-[clamp(2.5rem,9vw,5.5rem)] font-extrabold leading-[0.9] tracking-tighter">
              ALWAYS IN <span className="text-acid">BETA.</span>
            </p>
            <p className="mt-5 max-w-sm text-lg leading-snug text-white/70">Biten fikir yok, süren deneme var.</p>
          </div>

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-8 lg:col-span-6">
            <nav aria-labelledby="footer-explore">
              <h2 id="footer-explore" className={headCls}>Keşfet</h2>
              <ul className="mt-4">
                {FOOTER_NAV.map((n) => (
                  <li key={n.label}>
                    <Link href={n.href} className={linkCls}>{n.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-labelledby="footer-connect">
              <h2 id="footer-connect" className={headCls}>Bağlantı kur</h2>
              <ul className="mt-4">
                <li>
                  <a
                    href={`mailto:${FOOTER_EMAIL}`}
                    className="inline-block break-words py-2 text-base font-semibold text-acid underline decoration-acid/50 underline-offset-4 transition-colors hover:decoration-acid"
                  >
                    {FOOTER_EMAIL}
                  </a>
                </li>
                {social.map((s) => (
                  <li key={s.id}>
                    <a href={s.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                      {s.label}
                      <span aria-hidden="true"> ↗</span>
                      <span className="sr-only"> (yeni sekmede açılır)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        {/* Marka imzası: dekoratif (Header'daki marka adı zaten var), ekran okuyucudan gizli. */}
        <div aria-hidden="true" className="mt-16 select-none sm:mt-20">
          <p className="whitespace-nowrap font-display text-[clamp(2.5rem,14.5vw,13rem)] font-extrabold leading-[0.85] tracking-tighter">
            {brand.left}
            <span className="text-electric">/</span>
            {brand.right}
          </p>
          <span className="mt-4 block h-1 w-full rounded-full bg-acid" />
        </div>

        <div className="flex flex-col gap-2 py-8 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {name}</p>
          <p>Fikirleri deniyorum. Dijital şeyler üretiyorum.</p>
          <p className="font-mono text-xs tracking-widest">{domain}</p>
        </div>
      </div>
    </footer>
  );
}
