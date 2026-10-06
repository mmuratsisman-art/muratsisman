'use client';

import type { NoteFormValues } from '@/lib/cms/admin/note-form';
import type { FormState } from '@/lib/cms/admin/state';
import { describedBy, Field, inputClass } from './fields';
import { useIntentAction } from './useIntentAction';

interface Props {
  mode: 'create' | 'edit';
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: NoteFormValues;
  id?: string;
  expectedDraftUpdatedAt?: string;
  slugLocked?: boolean;
  canPublish?: boolean;
  readingHint?: number;
}

export default function NoteForm({ mode, action, initial, id, expectedDraftUpdatedAt = '', slugLocked = false, canPublish = false, readingHint }: Props) {
  const { state, pending, formAction, submitAs } = useIntentAction(action);
  const err = state.fieldErrors ?? {};
  const val = (k: keyof NoteFormValues) => state.values?.[k] ?? initial[k];
  const slugHint = slugLocked ? "Yayındaki içeriğin slug'ı değiştirilemez (adres kırılır). Değiştirmek için önce yayından kaldırın." : 'Boş bırakırsanız başlıktan üretilir.';
  const readingHintText = `Boş bırakırsanız gövdeden otomatik hesaplanır${readingHint ? ` (şu an ≈ ${readingHint} dk)` : ''}.`;
  const HINT = {
    excerpt: 'Liste ve arama sonuçlarında görünen kısa özet (en fazla 400 karakter).',
    body: 'Boş satır = yeni paragraf. ## Başlık · > Alıntı · - Liste maddesi. Satır başında işaret karakteri istiyorsanız önüne \\ koyun.',
    tags: 'Virgülle ayırın (en fazla 12).',
    date: 'Boş bırakırsanız yayınlandığı gün atanır.',
  } as const;

  return (
    <form action={formAction} className="mt-8 space-y-6" noValidate>
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="expected_draft_updated_at" value={expectedDraftUpdatedAt} />

      {state.status === 'error' && state.message && (
        <p role="alert" className="rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
          {state.message}
        </p>
      )}

      <Field id="note-title" label="BAŞLIK" error={err.title}>
        <input id="note-title" name="title" defaultValue={val('title')} maxLength={200} required aria-invalid={!!err.title} aria-describedby={describedBy('note-title', undefined, err.title)} className={inputClass} />
      </Field>

      <Field id="note-slug" label="SLUG" hint={slugHint} error={err.slug}>
        <input id="note-slug" name="slug" defaultValue={val('slug')} readOnly={slugLocked} maxLength={120} aria-invalid={!!err.slug} aria-describedby={describedBy('note-slug', slugHint, err.slug)} className={`${inputClass} font-mono`} />
      </Field>

      <Field id="note-excerpt" label="ÖZET" hint={HINT.excerpt} error={err.excerpt}>
        <textarea id="note-excerpt" name="excerpt" defaultValue={val('excerpt')} rows={3} maxLength={500} aria-invalid={!!err.excerpt} aria-describedby={describedBy('note-excerpt', HINT.excerpt, err.excerpt)} className={inputClass} />
      </Field>

      <Field
        id="note-body"
        label="GÖVDE"
        hint={HINT.body}
        error={err.body}
      >
        <textarea id="note-body" name="body" defaultValue={val('body')} rows={18} aria-invalid={!!err.body} aria-describedby={describedBy('note-body', HINT.body, err.body)} className={`${inputClass} font-mono text-sm leading-relaxed`} />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="note-tags" label="ETİKETLER" hint={HINT.tags} error={err.tags}>
          <input id="note-tags" name="tags" defaultValue={val('tags')} aria-invalid={!!err.tags} aria-describedby={describedBy('note-tags', HINT.tags, err.tags)} className={inputClass} />
        </Field>
        <Field id="note-accent" label="RENK" error={err.accent}>
          <select id="note-accent" name="accent" defaultValue={val('accent')} className={inputClass}>
            <option value="blue">blue</option>
            <option value="green">green</option>
            <option value="orange">orange</option>
            <option value="purple">purple</option>
          </select>
        </Field>
        <Field id="note-date" label="TARİH" hint={HINT.date} error={err.published_at}>
          <input id="note-date" name="published_at" type="date" defaultValue={val('published_at')} aria-invalid={!!err.published_at} aria-describedby={describedBy('note-date', HINT.date, err.published_at)} className={inputClass} />
        </Field>
        <Field id="note-reading" label="OKUMA SÜRESİ (DK)" hint={readingHintText} error={err.reading_time}>
          <input id="note-reading" name="reading_time" inputMode="numeric" defaultValue={val('reading_time')} aria-invalid={!!err.reading_time} aria-describedby={describedBy('note-reading', readingHintText, err.reading_time)} className={inputClass} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-fg/15 pt-6">
        <button type="submit" formAction={submitAs('save')} disabled={pending} className="rounded-full border border-fg/40 px-6 py-3 font-semibold hover:bg-fg/5 disabled:opacity-60">
          {mode === 'create' ? 'Taslağı Oluştur' : 'Taslağı Kaydet'}
        </button>
        <p className="text-sm text-muted">Taslak kaydı yayındaki sürümü değiştirmez.</p>
      </div>

      {mode === 'edit' && canPublish && (
        <fieldset className="rounded-2xl border border-fg/30 p-5">
          <legend className="px-2 font-mono text-xs tracking-widest">YAYINLA</legend>
          <p className="text-sm text-muted">
            Form içeriği önce taslak olarak kaydedilir, sonra yayınlanır (tek adımda). Yayınlama yayındaki sürümün yerini alır.
          </p>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input type="checkbox" name="confirm_publish" className="mt-1" aria-describedby={err.confirm_publish ? 'confirm-publish-error' : undefined} />
            <span>Bu içeriği yayınlamak istediğimi onaylıyorum.</span>
          </label>
          {err.confirm_publish && (
            <p id="confirm-publish-error" role="alert" className="mt-2 text-sm font-semibold">
              {err.confirm_publish}
            </p>
          )}
          <button type="submit" formAction={submitAs('publish')} disabled={pending} className="mt-4 rounded-full bg-acid px-6 py-3 font-semibold text-ink hover:-translate-y-0.5 disabled:opacity-60">
            Yayınla
          </button>
        </fieldset>
      )}
      {mode === 'create' && <p className="text-sm text-muted">Taslağı oluşturduktan sonra düzenleme sayfasından yayınlayabilirsiniz.</p>}
    </form>
  );
}
