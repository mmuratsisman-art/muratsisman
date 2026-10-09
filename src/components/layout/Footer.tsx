export default function Footer({ name, domain }: { name: string; domain: string }) {
  return (
    <footer className="border-t border-fg/10 bg-bg">
      <div className="shell flex flex-col gap-2 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} {name}</p>
        <p className="font-mono text-xs tracking-widest">{domain}</p>
      </div>
    </footer>
  );
}
