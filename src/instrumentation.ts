/**
 * Sunucu başlarken bir kez çalışır. Build ile çalışma zamanı CONTENT_SOURCE farklıysa süreç başlamaz (fail-closed, bkz. lib/content/build-guard.ts).
 * Node'a özgü kod (process.exit) Edge derlemesine girmesin diye ayrı dosyada ve dinamik import ile çağrılır (Next'in önerdiği desen).
 * İstek yoluna dokunmaz: statik sitenin davranışı değişmez.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runBuildSourceGuard } = await import('./instrumentation-node');
    runBuildSourceGuard();
  }
}
