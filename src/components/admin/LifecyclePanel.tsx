import type { LifecycleView } from '@/lib/cms/admin/lifecycle';

interface Props {
  id: string;
  lifecycle: LifecycleView;
  unpublishAction: (formData: FormData) => Promise<void>;
  discardAction: (formData: FormData) => Promise<void>;
}

/**
 * Yayından kaldır / Taslağı at: bilinçli, onay kutulu eylemler. SİLME YOK:
 * "Taslağı at" yalnızca bekleyen değişiklikleri kaldırır, kaydı ve yayındaki sürümü silmez.
 */
export default function LifecyclePanel({ id, lifecycle, unpublishAction, discardAction }: Props) {
  if (!lifecycle.canUnpublish && !lifecycle.canDiscard) return null;
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
              <input type="hidden" name="id" value={id} />
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
        {lifecycle.canUnpublish && (
          <details className="rounded-2xl border border-fg/25 p-4">
            <summary className="cursor-pointer font-semibold">Yayından Kaldır</summary>
            <form action={unpublishAction} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={id} />
              <p className="text-sm text-muted">
                İçerik yayından kalkar ve taslak durumuna döner; içerik silinmez. Public site bu aşamada henüz dosya tabanlı olduğundan
                gerçek adres şimdilik etkilenmez.
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
