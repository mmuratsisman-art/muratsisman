/**
 * analytics_summary() RPC çıktısının SIKI ayrıştırılması ve grafik geometrisi (SAF).
 * RPC güvenilir olsa da (yalnızca admin) arayüz, beklenmeyen şekilde çökmesin diye şekli doğrular; bozuksa null döner.
 */
export interface DailyPoint { day: string; views: number; clicks: number; uniques: number | null; capped: boolean }
export interface TopPage { path: string; views: number }
export interface ShowcaseRow { slug: string; title: string | null; clicks: number; clicksTotal: number }
export interface AnalyticsSummary {
  today: string;
  days: number;
  totalViews: number;
  todayViews: number;
  views7d: number;
  views30d: number;
  totalClicks: number;
  daily: DailyPoint[];
  topPages: TopPage[];
  showcase: ShowcaseRow[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseSummary(raw: unknown): AnalyticsSummary | null {
  if (!isObj(raw)) return null;
  const today = raw.today;
  const days = num(raw.days);
  const totalViews = num(raw.total_views);
  const todayViews = num(raw.today_views);
  const views7d = num(raw.views_7d);
  const views30d = num(raw.views_30d);
  const totalClicks = num(raw.total_clicks);
  if (typeof today !== 'string' || !DAY.test(today) || days === null || totalViews === null || todayViews === null || views7d === null || views30d === null || totalClicks === null) return null;
  if (!Array.isArray(raw.daily) || !Array.isArray(raw.top_pages) || !Array.isArray(raw.showcase)) return null;

  const daily: DailyPoint[] = [];
  for (const d of raw.daily) {
    if (!isObj(d) || typeof d.day !== 'string' || !DAY.test(d.day)) return null;
    const views = num(d.views);
    const clicks = num(d.clicks);
    const uniques = d.uniques === null ? null : num(d.uniques);
    if (views === null || clicks === null || (d.uniques !== null && uniques === null) || typeof d.capped !== 'boolean') return null;
    daily.push({ day: d.day, views, clicks, uniques, capped: d.capped });
  }
  const topPages: TopPage[] = [];
  for (const p of raw.top_pages) {
    if (!isObj(p) || typeof p.path !== 'string') return null;
    const views = num(p.views);
    if (views === null) return null;
    topPages.push({ path: p.path, views });
  }
  const showcase: ShowcaseRow[] = [];
  for (const s of raw.showcase) {
    if (!isObj(s) || typeof s.slug !== 'string' || !(s.title === null || typeof s.title === 'string')) return null;
    const clicks = num(s.clicks);
    const clicksTotal = num(s.clicks_total);
    if (clicks === null || clicksTotal === null) return null;
    showcase.push({ slug: s.slug, title: s.title as string | null, clicks, clicksTotal });
  }
  return { today, days, totalViews, todayViews, views7d, views30d, totalClicks, daily, topPages, showcase };
}

export interface Bar { x: number; y: number; w: number; h: number; day: string; views: number }

/** Günlük görüntüleme çubukları (SVG). max 0 ise tüm çubuklar yükseklik 0. */
export function chartBars(daily: DailyPoint[], width: number, height: number, gap = 2): { bars: Bar[]; max: number } {
  const max = daily.reduce((m, d) => Math.max(m, d.views), 0);
  const n = daily.length;
  if (n === 0) return { bars: [], max };
  const w = Math.max((width - gap * (n - 1)) / n, 1);
  const bars = daily.map((d, i) => {
    const h = max === 0 ? 0 : Math.max(d.views === 0 ? 0 : 2, Math.round((d.views / max) * height * 100) / 100);
    return { x: Math.round(i * (w + gap) * 100) / 100, y: Math.round((height - h) * 100) / 100, w: Math.round(w * 100) / 100, h, day: d.day, views: d.views };
  });
  return { bars, max };
}

export const fmtInt = (n: number): string => n.toLocaleString('tr-TR');
