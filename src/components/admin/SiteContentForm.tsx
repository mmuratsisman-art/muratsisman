'use client';

import type { FormState } from '@/lib/cms/admin/state';
import { CURRENTLY_ROWS, isFriendlyKey } from '@/lib/cms/validate/site';
import type { SiteContentKey } from '@/lib/cms/types';
import { describedBy, Field, inputClass } from './fields';
import FormSelect from './FormSelect';
import { PublishPanel, SaveBar } from './FormActions';
import { useIntentAction } from './useIntentAction';

interface Props {
  contentKey: SiteContentKey;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: Record<string, string>;
  expectedDraftUpdatedAt: string;
  canPublish: boolean;
}

const JSON_HINTS: Partial<Record<SiteContentKey, string>> = {
  site_meta: 'Alanlar: name, brand { left, right }, domain, description.',
  social: 'Alanlar: links [ { id, label, href } ]. href: #…, /yol, https://… veya mailto:…',
  lab_intro: 'Alanlar: lines [ "satır 1", "satır 2", … ] (en fazla 6).',
  lab_page: 'Alanlar: eyebrow, note, projectsLinkLabel.',
  notes_page: 'Alanlar: eyebrow, intro.',
  lab_categories: 'Alanlar: items [ { id, label, accent } ]; accent: blue | green | orange | purple.',
};

export default function SiteContentForm({ contentKey, action, initial, expectedDraftUpdatedAt, canPublish }: Props) {
  const { state, pending, formAction, submitAs } = useIntentAction(action);
  const err = state.fieldErrors ?? {};
  const v = (k: string) => state.values?.[k] ?? initial[k] ?? '';
  const f = (id: string, name: string, label: string, opts: { hint?: string; area?: number; max?: number; mono?: boolean } = {}) => (
    <Field id={`site-${id}`} label={label} hint={opts.hint} error={err[name]}>
      {opts.area ? (
        <textarea id={`site-${id}`} name={name} defaultValue={v(name)} rows={opts.area} aria-invalid={!!err[name]} aria-describedby={describedBy(`site-${id}`, opts.hint, err[name])} className={`${inputClass} ${opts.mono ? 'font-mono text-xs leading-relaxed' : ''}`} spellCheck={!opts.mono} />
      ) : (
        <input id={`site-${id}`} name={name} defaultValue={v(name)} maxLength={opts.max} aria-invalid={!!err[name]} aria-describedby={describedBy(`site-${id}`, opts.hint, err[name])} className={inputClass} />
      )}
    </Field>
  );

  return (
    <form action={formAction} className="mt-8 space-y-6" noValidate>
      <input type="hidden" name="key" value={contentKey} />
      <input type="hidden" name="expected_draft_updated_at" value={expectedDraftUpdatedAt} />

      {state.status === 'error' && state.message && (
        <p role="alert" className="rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
          {state.message}
          {err._form && <span className="mt-1 block font-normal">{err._form}</span>}
        </p>
      )}

      {contentKey === 'hero' && (
        <>
          {f('eyebrow', 'eyebrow', 'ÜST YAZI', { max: 100, hint: 'Başlığın üstündeki küçük yazı, ör. MURAT/LAB — 2026.' })}
          <div className="grid gap-6 sm:grid-cols-2">
            {f('first', 'first', 'BÜYÜK BAŞLIK · 1. SATIR', { max: 60 })}
            {f('last', 'last', 'BÜYÜK BAŞLIK · 2. SATIR', { max: 60 })}
          </div>
          {f('roles', 'roles', 'ROLLER', { max: 200, hint: 'Başlığın altındaki tek satır.' })}
          {f('message', 'message', 'ANA MESAJ', { area: 4, hint: 'Her satır ayrı bir satır olarak görünür (en fazla 6 satır).' })}
          <div className="grid gap-6 sm:grid-cols-2">
            {f('cta1l', 'cta_primary_label', 'BİRİNCİ DÜĞME · METİN', { max: 60 })}
            {f('cta1h', 'cta_primary_href', 'BİRİNCİ DÜĞME · BAĞLANTI', { max: 300, hint: '/#projects, /yol, https://… veya mailto:…' })}
            {f('cta2l', 'cta_secondary_label', 'İKİNCİ DÜĞME · METİN', { max: 60 })}
            {f('cta2h', 'cta_secondary_href', 'İKİNCİ DÜĞME · BAĞLANTI', { max: 300 })}
          </div>
          {f('concepts', 'concepts', 'KAVRAM ETİKETLERİ', { area: 5, hint: 'Tam 4 satır: küredeki yüzen etiketler (ör. BUILD, LEARN, AUTOMATE, IDEAS).' })}
        </>
      )}

      {contentKey === 'currently' && (
        <>
          <p className="text-sm text-muted">En fazla {CURRENTLY_ROWS} kart. Başlığı ve metni boş bırakılan satır yok sayılır.</p>
          {Array.from({ length: CURRENTLY_ROWS }, (_, i) => i + 1).map((i) => (
            <fieldset key={i} className="space-y-4 rounded-2xl border border-fg/25 p-5">
              <legend className="px-2 font-mono text-xs tracking-widest">KART {i}</legend>
              <input type="hidden" name={`item_id_${i}`} value={v(`item_id_${i}`)} />
              <div className="grid gap-4 sm:grid-cols-3">
                {f(`l${i}`, `label_${i}`, 'ETİKET', { max: 40, hint: i === 1 ? 'Ör. BUILDING' : undefined })}
                {f(`v${i}`, `value_${i}`, 'METİN', { max: 80 })}
                <Field id={`site-a${i}`} label="RENK" error={err[`accent_${i}`]}>
                  <FormSelect id={`site-a${i}`} name={`accent_${i}`} value={v(`accent_${i}`) || 'blue'} className={inputClass}>
                    <option value="blue">blue</option>
                    <option value="green">green</option>
                    <option value="orange">orange</option>
                    <option value="purple">purple</option>
                  </FormSelect>
                </Field>
              </div>
            </fieldset>
          ))}
        </>
      )}

      {contentKey === 'about' && (
        <>
          {f('title', 'title', 'BAŞLIK', { max: 100 })}
          {f('text', 'text', 'METİN', { area: 6, hint: 'En fazla 600 karakter.' })}
          {f('img', 'image_media_id', 'PROFİL GÖRSELİ (MEDYA KİMLİĞİ)', { max: 60, hint: 'İsteğe bağlı. Görsel yükleme ve seçici sonraki fazda (3C) gelecek; şimdilik yalnızca mevcut bir medya kimliği (UUID) girilebilir.' })}
        </>
      )}

      {contentKey === 'contact' && (
        <>
          {f('title', 'title', 'BÜYÜK BAŞLIK', { area: 3, hint: 'Her satır ayrı bir satır (en fazla 3).' })}
          {f('lines', 'lines', 'METİN', { area: 5, hint: 'Her satır ayrı bir satır (en fazla 6).' })}
          <div className="grid gap-6 sm:grid-cols-2">
            {f('cta-l', 'cta_label', 'DÜĞME · METİN', { max: 60 })}
            {f('cta-h', 'cta_href', 'DÜĞME · BAĞLANTI', { max: 300, hint: 'E-posta için mailto:ad@alanadi.com' })}
          </div>
        </>
      )}

      {!isFriendlyKey(contentKey) && f('json', 'json', 'JSON', { area: 22, mono: true, hint: JSON_HINTS[contentKey] ? `${JSON_HINTS[contentKey]} Geçersiz JSON veya şekil kaydedilmez.` : 'Geçersiz JSON veya şekil kaydedilmez.' })}

      <SaveBar label="Taslağı Kaydet" pending={pending} submitAs={submitAs} />
      {canPublish && (
        <PublishPanel
          pending={pending}
          submitAs={submitAs}
          error={err.confirm_publish}
          description="Form içeriği önce taslak olarak kaydedilir, sonra yayınlanır (tek adımda). Yayınlama, bu belgenin yayındaki sürümünün yerini alır."
        />
      )}
    </form>
  );
}
