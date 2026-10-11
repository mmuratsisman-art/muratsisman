import Link from 'next/link';
import DailyChart from './DailyChart';
import { fmtInt, type AnalyticsSummary } from '@/lib/analytics/summary';

function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-t border-fg/15 pt-3">
      <dt className="font-mono text-[11px] tracking-widest text-muted">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-extrabold leading-none tracking-tight">{value}</dd>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export interface CollectionState {
  endpointEnabled: boolean;
  missing: string[];
  beaconBuilt: boolean;
}

/** /admin/analytics içeriği: kartlar, günlük grafik, en çok görüntülenen sayfalar, Showcase tıklamaları. Saf sunum (veri dışarıdan gelir). */
export default function AnalyticsView({ summary, days, state }: { summary: AnalyticsSummary; days: 7 | 30; state: CollectionState }) {
  const today = summary.daily[summary.daily.length - 1];
  const anyCapped = summary.daily.some((d) => d.capped);
  const collecting = state.endpointEnabled && state.beaconBuilt;
  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-muted">ZİYARET İSTATİSTİKLERİ</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">İstatistikler</h1>
        <nav aria-label="Zaman aralığı" className="flex gap-2">
          {([7, 30] as const).map((d) => (
            <Link
              key={d}
              href={`/admin/analytics?days=${d}`}
              aria-current={d === days ? 'page' : undefined}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${d === days ? 'border-fg bg-fg/10' : 'border-fg/30 hover:bg-fg/5'}`}
            >
              Son {d} gün
            </Link>
          ))}
        </nav>
      </div>

      <p role="status" className={`mt-6 rounded-xl border px-4 py-3 text-sm ${collecting ? 'border-fg/20' : 'border-hot font-semibold'}`}>
        {collecting
          ? 'Toplama AÇIK. Sayılar yaklaşıktır.'
          : `Toplama KAPALI: ${state.beaconBuilt ? '' : 'tarayıcı beacon’ı bu sürümde derlenmemiş. '}${state.endpointEnabled ? '' : `uç nokta pasif (eksik: ${state.missing.join(', ')}). `}`.trim()}
      </p>
      {anyCapped && (
        <p role="status" className="mt-3 rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
          Bazı günlerde günlük üst sınır aşıldı; o günlerin sayıları eksik olabilir.
        </p>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
        <Card label="TOPLAM GÖRÜNTÜLEME" value={fmtInt(summary.totalViews)} />
        <Card label="BUGÜN" value={fmtInt(summary.todayViews)} />
        <Card label="SON 7 GÜN" value={fmtInt(summary.views7d)} />
        <Card label="SON 30 GÜN" value={fmtInt(summary.views30d)} />
        <Card
          label="BUGÜN YAKLAŞIK TEKİL"
          value={today?.uniques === null || today === undefined ? '—' : `≈ ${fmtInt(today.uniques)}`}
          note="Günlük, yaklaşık. 7/30 günlük tekil hesaplanmaz."
        />
        <Card label="SHOWCASE TIKLAMASI (TOPLAM)" value={fmtInt(summary.totalClicks)} />
      </dl>

      <h2 className="mt-10 font-mono text-xs font-normal tracking-widest text-muted">GÜNLÜK ZİYARET (SON {days} GÜN)</h2>
      <DailyChart daily={summary.daily} />

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="top-pages">
          <h2 id="top-pages" className="font-mono text-xs font-normal tracking-widest text-muted">EN ÇOK GÖRÜNTÜLENEN SAYFALAR (SON {days} GÜN)</h2>
          {summary.topPages.length === 0 ? (
            <p className="mt-3 text-muted">Henüz veri yok.</p>
          ) : (
            <table className="mt-3 w-full border-y border-fg/15 text-left">
              <caption className="sr-only">En çok görüntülenen sayfalar</caption>
              <thead>
                <tr className="font-mono text-[11px] tracking-widest text-muted">
                  <th scope="col" className="py-2 pr-4 font-normal">SAYFA</th>
                  <th scope="col" className="py-2 text-right font-normal">GÖRÜNTÜLEME</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fg/15 border-t border-fg/15">
                {summary.topPages.map((p) => (
                  <tr key={p.path}>
                    <td className="py-3 pr-4 font-mono text-sm">{p.path}</td>
                    <td className="py-3 text-right tabular-nums">{fmtInt(p.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby="showcase">
          <h2 id="showcase" className="font-mono text-xs font-normal tracking-widest text-muted">SHOWCASE TIKLAMALARI</h2>
          {summary.showcase.length === 0 ? (
            <p className="mt-3 text-muted">Henüz tıklama yok.</p>
          ) : (
            <table className="mt-3 w-full border-y border-fg/15 text-left">
              <caption className="sr-only">Showcase bağlantısı tıklamaları</caption>
              <thead>
                <tr className="font-mono text-[11px] tracking-widest text-muted">
                  <th scope="col" className="py-2 pr-4 font-normal">PROJE</th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">SON {days} GÜN</th>
                  <th scope="col" className="py-2 text-right font-normal">TOPLAM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fg/15 border-t border-fg/15">
                {summary.showcase.map((s) => (
                  <tr key={s.slug}>
                    <td className="py-3 pr-4">
                      <span className="font-display font-bold">{s.title ?? s.slug}</span>
                      <span className="block font-mono text-[11px] tracking-wider text-muted">/projects/{s.slug}</span>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{fmtInt(s.clicks)}</td>
                    <td className="py-3 text-right tabular-nums">{fmtInt(s.clicksTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <p className="mt-10 max-w-2xl text-sm text-muted">
        Sayılar yaklaşıktır: botlar tam elenemez, aynı ağdaki ziyaretçiler tek, IP’si değişenler birden fazla sayılabilir, Do Not Track / Global Privacy Control
        gönderenler sayılmaz ve günlük üst sınır aşılırsa sayım durur. Çerez veya tarayıcı depolaması kullanılmaz; IP, User-Agent ve ziyaretçi kimliği saklanmaz.
        Ayrıntılar: docs/cms/ANALYTICS.md.
      </p>
    </div>
  );
}
