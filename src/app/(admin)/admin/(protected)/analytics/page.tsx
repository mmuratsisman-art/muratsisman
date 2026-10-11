import { notFound } from 'next/navigation';
import AnalyticsView from '@/components/admin/analytics/AnalyticsView';
import { analyticsStatus } from '@/lib/analytics/config';
import { parseSummary } from '@/lib/analytics/summary';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { createClient } from '@/lib/supabase/server';

/** Admin → İstatistikler. Okuma yalnızca oturumlu admin ile: analytics_summary() içeride is_admin() ister (fail-closed). */
export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  const sp = await searchParams;
  const days: 7 | 30 = sp.days === '7' ? 7 : 30;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('analytics_summary', { p_days: days });
  const summary = error ? null : parseSummary(data);
  if (!summary) {
    return (
      <div>
        <p className="font-mono text-xs tracking-widest text-muted">ZİYARET İSTATİSTİKLERİ</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">İstatistikler</h1>
        <p role="alert" className="mt-8 rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
          İstatistikler okunamadı. Analytics migration’ı (0007) bu veritabanına uygulanmış mı? Ayrıntı: docs/cms/ANALYTICS-TEST-KURULUM.md.
        </p>
      </div>
    );
  }
  const st = analyticsStatus(process.env);
  return (
    <AnalyticsView
      summary={summary}
      days={days}
      state={{ endpointEnabled: st.enabled, missing: st.enabled ? [] : st.missing, beaconBuilt: process.env.NEXT_PUBLIC_ANALYTICS_BEACON === '1' }}
    />
  );
}
