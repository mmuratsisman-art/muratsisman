import SiteChrome from '@/components/layout/SiteChrome';

/**
 * Eşleşmeyen URL'ler ve notFound() çağrıları kök not-found'a düşer (route group layout'ları bu durumda uygulanmaz).
 * Eskiden kök layout public Header/Footer'ı taşıdığı için 404 sayfaları da onlarla görünüyordu; bu davranışı korumak için
 * kabuk burada açıkça sarılır. (admin yapılandırılmamışken /admin → 404 de aynı sayfayı görür: admin yüzeyi gizli kalır.)
 */
export default function NotFound() {
  return (
    <SiteChrome>
      <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <h1 className="font-display text-6xl font-extrabold tracking-tight">404</h1>
        <p className="mt-4 text-muted">This page could not be found.</p>
      </div>
    </SiteChrome>
  );
}
