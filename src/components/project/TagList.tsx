export default function TagList({ tags }: { tags: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2.5">
      {tags.map((t) => (
        <li key={t} className="inline-flex items-center gap-2 rounded-full border border-fg/25 bg-surface px-4 py-2 font-mono text-xs tracking-wider">
          <span aria-hidden className="h-2 w-2 rounded-full bg-[rgb(var(--card-accent))]" />
          {t}
        </li>
      ))}
    </ul>
  );
}
