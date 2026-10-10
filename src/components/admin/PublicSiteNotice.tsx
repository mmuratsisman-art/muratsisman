/** İçerik yayınlama davranışını CMS ve statik modlar için açıklar. */
export default function PublicSiteNotice() {
  return (
    <p className="mt-6 rounded-xl border border-dashed border-fg/25 px-4 py-3 text-sm text-muted">
      İçerik değişiklikleri önce taslak olarak kaydedilir. Yayınla işlemi tamamlandığında CMS modundaki
      herkese açık site güncellenir. Statik modda ise dosya tabanlı içerik kullanılmaya devam eder.
    </p>
  );
}
