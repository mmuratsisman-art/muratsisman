import type { SiteNode } from '@/lib/cms/preview/site';

/**
 * Site belgesi için okunabilir belge önizlemesi. BU, ana sayfanın ya da sitenin gerçek önizlemesi DEĞİLDİR:
 * belge alanlarını ve değerlerini düzenli biçimde listeler. Her değer düz metin olarak çizilir (HTML/bağlantı yorumlanmaz).
 */
function NodeView({ node }: { node: SiteNode }) {
  switch (node.t) {
    case 'text':
      return node.v === '' ? <span className="text-muted">(boş)</span> : <span className="whitespace-pre-wrap break-words">{node.v}</span>;
    case 'scalar':
      return <span className="font-mono text-sm">{node.v}</span>;
    case 'list':
      if (node.items.length === 0) return <span className="text-muted">(boş liste)</span>;
      return (
        <ol className="space-y-2 border-l border-fg/20 pl-4">
          {node.items.map((n, i) => (
            <li key={i}>
              <NodeView node={n} />
            </li>
          ))}
        </ol>
      );
    case 'object':
      return (
        <dl className="space-y-3">
          {node.fields.map((f) => (
            <div key={f.name} className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
              <dt className="break-words font-mono text-xs tracking-widest text-muted">{f.name}</dt>
              <dd className="min-w-0">
                <NodeView node={f.node} />
              </dd>
            </div>
          ))}
        </dl>
      );
  }
}

export default function SiteDocView({ node }: { node: SiteNode }) {
  return (
    <div className="rounded-2xl border border-fg/15 bg-surface p-5 sm:p-8">
      <NodeView node={node} />
    </div>
  );
}
