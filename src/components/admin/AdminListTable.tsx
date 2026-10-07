import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import type { LifecycleTone } from '@/lib/cms/admin/lifecycle';
import StatusBadge from './StatusBadge';

export interface AdminListRow {
  id: string;
  href: string;
  title: string;
  meta: string;
  /** Yalnızca gösterim için gereken alanlar (Notes/Lab/Projects LifecycleView'i ve Site yaşam döngüsü bunu karşılar) */
  lifecycle: { label: string; tone: LifecycleTone };
  /** İçerik henüz yoksa null */
  updatedAt: string | null;
}

/** Sade liste: BAŞLIK | DURUM | GÜNCELLENDİ | İŞLEM */
export default function AdminListTable({ caption, rows, emptyText }: { caption: string; rows: AdminListRow[]; emptyText: string }) {
  if (rows.length === 0) return <p className="mt-8 text-muted">{emptyText}</p>;
  return (
    <div className="mt-8 overflow-x-auto">
      <table className="w-full min-w-[40rem] border-y border-fg/15 text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="font-mono text-[11px] tracking-widest text-muted">
            <th scope="col" className="py-3 pr-4 font-normal">BAŞLIK</th>
            <th scope="col" className="py-3 pr-4 font-normal">DURUM</th>
            <th scope="col" className="py-3 pr-4 font-normal">GÜNCELLENDİ</th>
            <th scope="col" className="py-3 text-right font-normal">İŞLEM</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-fg/15 border-t border-fg/15">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-4 pr-4">
                <Link href={r.href} className="font-display text-lg font-bold leading-tight hover:underline">
                  {r.title || '(başlıksız)'}
                </Link>
                <p className="mt-1 font-mono text-[11px] tracking-wider text-muted">{r.meta}</p>
              </td>
              <td className="py-4 pr-4">
                <StatusBadge label={r.lifecycle.label} tone={r.lifecycle.tone} />
              </td>
              <td className="py-4 pr-4 text-sm text-muted">
                {r.updatedAt ? <time dateTime={r.updatedAt}>{formatDateTime(r.updatedAt)}</time> : '—'}
              </td>
              <td className="py-4 text-right">
                <Link href={r.href} className="rounded-full border border-fg/30 px-4 py-1.5 text-sm font-semibold hover:bg-fg/5">
                  Düzenle
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
