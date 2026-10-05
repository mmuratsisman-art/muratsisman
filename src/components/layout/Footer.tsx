import { siteConfig } from '@/data/site';

export default function Footer() {
  return (
    <footer className="border-t border-fg/10 bg-bg">
      <div className="shell flex flex-col gap-2 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} {siteConfig.name}</p>
        <p className="font-mono text-xs tracking-widest">{siteConfig.domain}</p>
      </div>
    </footer>
  );
}
