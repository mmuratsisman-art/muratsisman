import { chartBars, fmtInt, type DailyPoint } from '@/lib/analytics/summary';

const W = 640;
const H = 140;

/** Günlük sayfa görüntüleme çubuk grafiği (bağımlılıksız SVG). Erişilebilirlik için gizli veri tablosu da verilir. */
export default function DailyChart({ daily }: { daily: DailyPoint[] }) {
  const { bars, max } = chartBars(daily, W, H);
  const first = daily[0]?.day;
  const last = daily[daily.length - 1]?.day;
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H + 4}`} role="img" aria-label={`Günlük sayfa görüntüleme grafiği, ${daily.length} gün, en yüksek ${fmtInt(max)}`} className="h-auto w-full text-acid">
        <line x1="0" y1={H + 1} x2={W} y2={H + 1} className="stroke-fg/20" strokeWidth="1" />
        {bars.map((b) => (
          <rect key={b.day} x={b.x} y={b.y} width={b.w} height={b.h} rx="1" fill="currentColor">
            <title>{`${b.day}: ${fmtInt(b.views)} görüntüleme`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="mt-2 flex justify-between font-mono text-[11px] tracking-wider text-muted">
        <span>{first ?? ''}</span>
        <span>EN YÜKSEK GÜN: {fmtInt(max)}</span>
        <span>{last ?? ''}</span>
      </figcaption>
      <table className="sr-only">
        <caption>Günlük sayfa görüntüleme, tıklama ve yaklaşık tekil ziyaretçi</caption>
        <thead>
          <tr><th scope="col">Gün</th><th scope="col">Görüntüleme</th><th scope="col">Yaklaşık tekil</th><th scope="col">Showcase tıklaması</th></tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}><td>{d.day}</td><td>{d.views}</td><td>{d.uniques ?? 'hesaplanamadı'}</td><td>{d.clicks}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
