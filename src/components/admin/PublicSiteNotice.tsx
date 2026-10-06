/** Sakin bir bilgi notu: CMS değişiklikleri public siteye bu aşamada yansımaz (cutover 3B-E). */
export default function PublicSiteNotice() {
  return (
    <p className="mt-6 rounded-xl border border-dashed border-fg/25 px-4 py-3 text-sm text-muted">
      Bu aşamada public site henüz dosya tabanlı içerik kullanıyor. CMS public cutover sonraki fazda yapılacaktır; burada yaptığınız
      değişiklikler şimdilik yalnızca yönetim panelinde görünür.
    </p>
  );
}
