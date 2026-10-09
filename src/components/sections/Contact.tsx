import { getSiteContent } from '@/lib/content';

export default async function Contact() {
  const { siteConfig, socialLinks } = await getSiteContent();
  const { contact } = siteConfig;
  return (
    <section id="contact" aria-labelledby="contact-title" className="on-color overflow-hidden bg-contact py-24 text-white sm:py-32">
      <div className="shell">
        <h2 id="contact-title" className="font-display text-[clamp(2.25rem,11.5vw,10rem)] font-extrabold leading-[0.85] tracking-tighter">
          {contact.title.map((l) => (
            <span key={l} className="block">{l}</span>
          ))}
        </h2>
        <p className="mt-8 max-w-xl text-xl leading-snug sm:text-2xl">
          {contact.lines.map((l) => (
            <span key={l} className="block">{l}</span>
          ))}
        </p>
        <a href={contact.cta.href} className="mt-10 inline-flex rounded-full bg-acid px-7 py-4 font-semibold text-ink transition hover:-translate-y-0.5">
          {contact.cta.label}
        </a>
        <ul className="mt-14 flex flex-wrap gap-3">
          {socialLinks.map((s) => (
            <li key={s.id}>
              <a href={s.href} className="inline-flex rounded-full border border-white/40 px-4 py-2 text-sm font-medium transition hover:bg-white hover:text-ink">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
