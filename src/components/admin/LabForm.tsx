'use client';

import type { LabFormValues } from '@/lib/cms/admin/lab-form';
import type { FormState } from '@/lib/cms/admin/state';
import { LAB_STATUSES, LAB_TYPES } from '@/lib/cms/validate/lab';
import { describedBy, Field, inputClass } from './fields';
import FormSelect from './FormSelect';
import { useIntentAction } from './useIntentAction';

interface Props {
  mode: 'create' | 'edit';
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: LabFormValues;
  id?: string;
  expectedDraftUpdatedAt?: string;
  slugLocked?: boolean;
  canPublish?: boolean;
}

const HINT = {
  slug: 'Boş bırakırsanız başlıktan üretilir.',
  slugLocked: "Yayındaki içeriğin slug'ı değiştirilemez (adres kırılır). Değiştirmek için önce yayından kaldırın.",
  shortTitle: 'Ana sayfadaki listede kullanılır (isteğe bağlı, en fazla 40 karakter).',
  summary: 'Listede görünen tek cümlelik özet (en fazla 300 karakter). Yayınlamak için gerekli.',
  description: 'Detay sayfasındaki ilk paragraf (en fazla 1200 karakter).',
  tags: 'Virgülle ayırın (en fazla 12).',
  year: '4 haneli yıl.',
  sort: 'Küçük sayı önce gelir (0–9999).',
  story: 'Boş satırla ayrılmış paragraflar. Boş bırakılan alan sayfada gösterilmez.',
} as const;

const STORY: { name: 'story_why' | 'story_how' | 'story_learned' | 'story_state'; label: string }[] = [
  { name: 'story_why', label: 'WHY IT EXISTS' },
  { name: 'story_how', label: 'HOW IT WORKS' },
  { name: 'story_learned', label: 'WHAT I LEARNED' },
  { name: 'story_state', label: 'CURRENT STATE' },
];

export default function LabForm({ mode, action, initial, id, expectedDraftUpdatedAt = '', slugLocked = false, canPublish = false }: Props) {
  const { state, pending, formAction, submitAs } = useIntentAction(action);
  const err = state.fieldErrors ?? {};
  const val = (k: keyof LabFormValues) => state.values?.[k] ?? initial[k];
  const slugHint = slugLocked ? HINT.slugLocked : HINT.slug;
  // Onay kutusu: hata sonrası formu doldururken kullanıcının işaretini korur
  const featured = state.values ? state.values.featured === 'on' : initial.featured === 'on';

  return (
    <form action={formAction} className="mt-8 space-y-6" noValidate>
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="expected_draft_updated_at" value={expectedDraftUpdatedAt} />

      {state.status === 'error' && state.message && (
        <p role="alert" className="rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
          {state.message}
        </p>
      )}

      <Field id="lab-title" label="BAŞLIK" error={err.title}>
        <input id="lab-title" name="title" defaultValue={val('title')} maxLength={160} required aria-invalid={!!err.title} aria-describedby={describedBy('lab-title', undefined, err.title)} className={inputClass} />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="lab-slug" label="SLUG" hint={slugHint} error={err.slug}>
          <input id="lab-slug" name="slug" defaultValue={val('slug')} readOnly={slugLocked} maxLength={120} aria-invalid={!!err.slug} aria-describedby={describedBy('lab-slug', slugHint, err.slug)} className={`${inputClass} font-mono`} />
        </Field>
        <Field id="lab-short" label="KISA BAŞLIK" hint={HINT.shortTitle} error={err.short_title}>
          <input id="lab-short" name="short_title" defaultValue={val('short_title')} maxLength={60} aria-invalid={!!err.short_title} aria-describedby={describedBy('lab-short', HINT.shortTitle, err.short_title)} className={inputClass} />
        </Field>
      </div>

      <Field id="lab-summary" label="ÖZET" hint={HINT.summary} error={err.summary}>
        <textarea id="lab-summary" name="summary" defaultValue={val('summary')} rows={2} maxLength={400} aria-invalid={!!err.summary} aria-describedby={describedBy('lab-summary', HINT.summary, err.summary)} className={inputClass} />
      </Field>

      <Field id="lab-description" label="AÇIKLAMA" hint={HINT.description} error={err.description}>
        <textarea id="lab-description" name="description" defaultValue={val('description')} rows={4} maxLength={1500} aria-invalid={!!err.description} aria-describedby={describedBy('lab-description', HINT.description, err.description)} className={inputClass} />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="lab-type" label="TÜR" error={err.type}>
          <FormSelect id="lab-type" name="type" value={val('type')} className={inputClass}>
            {LAB_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </FormSelect>
        </Field>
        <Field id="lab-status" label="DENEY DURUMU" error={err.experiment_status}>
          <FormSelect id="lab-status" name="experiment_status" value={val('experiment_status')} className={inputClass}>
            {LAB_STATUSES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </FormSelect>
        </Field>
        <Field id="lab-accent" label="RENK" error={err.accent}>
          <FormSelect id="lab-accent" name="accent" value={val('accent')} className={inputClass}>
            <option value="blue">blue</option>
            <option value="green">green</option>
            <option value="orange">orange</option>
            <option value="purple">purple</option>
          </FormSelect>
        </Field>
        <Field id="lab-year" label="YIL" hint={HINT.year} error={err.year}>
          <input id="lab-year" name="year" inputMode="numeric" defaultValue={val('year')} maxLength={4} aria-invalid={!!err.year} aria-describedby={describedBy('lab-year', HINT.year, err.year)} className={inputClass} />
        </Field>
        <Field id="lab-sort" label="SIRA" hint={HINT.sort} error={err.sort_order}>
          <input id="lab-sort" name="sort_order" inputMode="numeric" defaultValue={val('sort_order')} aria-invalid={!!err.sort_order} aria-describedby={describedBy('lab-sort', HINT.sort, err.sort_order)} className={inputClass} />
        </Field>
        <Field id="lab-category" label="KATEGORİ" error={err.category}>
          <input id="lab-category" name="category" defaultValue={val('category')} maxLength={80} className={inputClass} />
        </Field>
      </div>

      <Field id="lab-tags" label="ETİKETLER" hint={HINT.tags} error={err.tags}>
        <input id="lab-tags" name="tags" defaultValue={val('tags')} aria-invalid={!!err.tags} aria-describedby={describedBy('lab-tags', HINT.tags, err.tags)} className={inputClass} />
      </Field>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="featured" defaultChecked={featured} className="mt-1" />
        <span>Ana sayfada öne çıkar (featured)</span>
      </label>

      <fieldset className="space-y-6 rounded-2xl border border-fg/25 p-5">
        <legend className="px-2 font-mono text-xs tracking-widest">HİKÂYE</legend>
        <p className="text-sm text-muted">{HINT.story}</p>
        {STORY.map((s) => (
          <Field key={s.name} id={`lab-${s.name}`} label={s.label} error={err[s.name]}>
            <textarea id={`lab-${s.name}`} name={s.name} defaultValue={val(s.name)} rows={5} aria-invalid={!!err[s.name]} aria-describedby={describedBy(`lab-${s.name}`, undefined, err[s.name])} className={inputClass} />
          </Field>
        ))}
      </fieldset>

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
