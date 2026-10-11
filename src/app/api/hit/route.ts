import { processHit } from '@/lib/analytics/hit';
import { runtimeDeps } from '@/lib/analytics/runtime';

/**
 * Ziyaretçi sayacı uç noktası. KAPALI varsayılır: etkinleştirme bayrakları/sırlar yoksa hiçbir iş yapmadan 204 döner.
 * Hata ve ret durumlarının TÜMÜ aynı 204 yanıtını verir (saldırgana ipucu yok; ziyaretçi deneyimi etkilenmez).
 * Çerez/depolama yok; IP ve User-Agent yalnızca günlük kovayı hesaplamak için kullanılır ve yazılmaz.
 * Middleware yalnızca /admin için çalışır; bu uç nokta onun dışındadır.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const h = request.headers;
    const ip = (h.get('x-real-ip') ?? h.get('x-forwarded-for') ?? '').split(',')[0].trim();
    await processHit(
      { method: request.method, headers: h, requestUrl: request.url, readBody: () => request.text(), ip, userAgent: h.get('user-agent') ?? '' },
      runtimeDeps(),
    );
  } catch {
    // asla dışarı sızdırma
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
