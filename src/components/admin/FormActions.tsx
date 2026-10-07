import type { Intent } from '@/lib/cms/admin/intent';

type SubmitAs = (intent: Intent) => (formData: FormData) => void;

/** "Taslağı Kaydet" düğmesi: intent AÇIKÇA yazılır (submitter name/value'suna güvenilmez, bkz. useIntentAction). */
export function SaveBar({ label, pending, submitAs, note = 'Taslak kaydı yayındaki sürümü değiştirmez.' }: { label: string; pending: boolean; submitAs: SubmitAs; note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-fg/15 pt-6">
      <button type="submit" formAction={submitAs('save')} disabled={pending} className="rounded-full border border-fg/40 px-6 py-3 font-semibold hover:bg-fg/5 disabled:opacity-60">
        {label}
      </button>
      <p className="text-sm text-muted">{note}</p>
    </div>
  );
}

/** Bilinçli yayın alanı: onay kutusu sunucuda ayrıca zorunludur. */
export function PublishPanel({ pending, submitAs, error, description }: { pending: boolean; submitAs: SubmitAs; error?: string; description?: string }) {
  return (
    <fieldset className="rounded-2xl border border-fg/30 p-5">
      <legend className="px-2 font-mono text-xs tracking-widest">YAYINLA</legend>
      <p className="text-sm text-muted">
        {description ?? 'Form içeriği önce taslak olarak kaydedilir, sonra yayınlanır (tek adımda). Yayınlama yayındaki sürümün yerini alır.'}
      </p>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" name="confirm_publish" className="mt-1" aria-describedby={error ? 'confirm-publish-error' : undefined} />
        <span>Bu içeriği yayınlamak istediğimi onaylıyorum.</span>
      </label>
      {error && (
        <p id="confirm-publish-error" role="alert" className="mt-2 text-sm font-semibold">
          {error}
        </p>
      )}
      <button type="submit" formAction={submitAs('publish')} disabled={pending} className="mt-4 rounded-full bg-acid px-6 py-3 font-semibold text-ink hover:-translate-y-0.5 disabled:opacity-60">
        Yayınla
      </button>
    </fieldset>
  );
}
