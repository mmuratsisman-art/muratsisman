interface Props {
  id: string;
  /** Yalnızca gereken yetenekler (LifecycleView bunu yapısal olarak karşılar) */
  lifecycle: { canUnpublish: boolean; canDiscard: boolean };
  /** Yoksa "Yayından Kaldır" gösterilmez (ör. Site İçeriği: public site bu belgelere ihtiyaç duyar) */
  unpublishAction?: (formData: FormData) => Promise<void>;
  discardAction: (formData: FormData) => Promise<void>;
  /** Tekil belgelerde (Site İçeriği) form alanı 'id' yerine bu ad kullanılır */
  idFieldName?: string;
}

/**
 * Yayından kaldır / Taslağı at: bilinçli, onay kutulu eylemler. SİLME YOK:
 * "Taslağı at" yalnızca bekleyen değişiklikleri kaldırır, kaydı ve yayındaki sürümü silmez.
 */
export default function LifecyclePanel({ id, lifecycle, unpublishAction, discardAction, idFieldName = 'id' }: Props) {
  const canUnpublish = lifecycle.canUnpublish && !!unpublishAction;
  if (!canUnpublish && !lifecycle.canDiscard) return null;
  return (
    <section aria-labelledby="lifecycle-title" className="mt-12 border-t border-fg/15 pt-8">
      <h2 id="lifecycle-title" className="font-mono text-xs font-normal tracking-widest text-muted">
        YAŞAM DÖNGÜSÜ
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {lifecycle.canDiscard && (
          <details className="rounded-2xl border border-fg/25 p-4">
            <summary className="cursor-pointer font-semibold">Taslağı At</summary>
            <form action={discardAction} className="mt-3 space-y-3">
              <input type="hidden" name={idFieldName} value={id} />
              <p className="text-sm text-muted">Bekleyen değişiklikler atılır; yayındaki sürüm olduğu gibi kalır. İçerik silinmez.</p>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="confirm_discard" className="mt-1" />
                <span>Bekleyen değişiklikleri atmak istediğimi onaylıyorum.</span>
              </label>
              <button type="submit" className="rounded-full border border-fg/30 px-5 py-2 text-sm font-semibold hover:bg-fg/5">
                Taslağı At
              </button>
            </form>
          </details>
        )}
        {canUnpublish && unpublishAction && (
          <details className="rounded-2xl border border-fg/25 p-4">
            <summary className="cursor-pointer font-semibold">Yayından Kaldır</summary>
            <form action={unpublishAction} className="mt-3 space-y-3">
              <input type="hidden" name={idFieldName} value={id} />
              <p className="text-sm text-muted">
                İçerik yayından kalkar ve taslak durumuna döner; içerik silinmez. CMS modunda herkese açık sitedeki
                görünürlüğü de etkilenir. Statik modda dosya tabanlı içerik kullanılmaya devam eder.
              </p>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="confirm_unpublish" className="mt-1" />
                <span>Yayından kaldırmayı onaylıyorum.</span>
              </label>
              <button type="submit" className="rounded-full border border-fg/30 px-5 py-2 text-sm font-semibold hover:bg-fg/5">
                Yayından Kaldır
              </button>
            </form>
          </details>
        )}
      </div>
    </section>
  );
}
