'use client';

import type { ProjectFormValues } from '@/lib/cms/admin/project-form';
import type { FormState } from '@/lib/cms/admin/state';
import { PROJECT_GRAPHICS, PROJECT_KINDS, PROJECT_SIZES } from '@/lib/cms/validate/projects';
import { describedBy, Field, inputClass } from './fields';
import FormSelect from './FormSelect';
import { PublishPanel, SaveBar } from './FormActions';
import { useIntentAction } from './useIntentAction';

interface Props {
  mode: 'create' | 'edit';
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: ProjectFormValues;
  id?: string;
  expectedDraftUpdatedAt?: string;
  slugLocked?: boolean;
  canPublish?: boolean;
}

const HINT = {
  slug: 'Boş bırakırsanız başlıktan üretilir.',
  slugLocked: "Yayındaki içeriğin slug'ı değiştirilemez (adres kırılır). Değiştirmek için önce yayından kaldırın.",
  subtitle: 'Başlığın altındaki kısa tanım (en fazla 160 karakter).',
  summary: 'Kartta ve proje sayfasının girişinde görünen özet (en fazla 600 karakter). Yayınlamak için gerekli.',
  kind: 'Proje türü. Yayınlamak için gerekli (Çok yakında projeler hariç).',
  typeLabel: 'Kartta görünen etiket, ör. PERSONAL PROJECT. Yayınlamak için gerekli.',
  category: 'Ör. Affiliate Commerce Platform. Yayınlamak için gerekli.',
  pill: 'Proje sayfasındaki durum etiketi (isteğe bağlı), ör. ACTIVE DEVELOPMENT. Metin ve renk birlikte girilmelidir.',
  tags: 'Virgülle ayırın (en fazla 12).',
  sort: 'Küçük sayı önce gelir (0–9999).',
  comingSoon: '“Çok yakında” projeler detay sayfası olmayan yer tutucu karttır; yalnızca başlık gerekir.',
  caseStudy: 'Vaka çalışması içeriği JSON olarak. Geçerli yapıya uymayan JSON kaydedilmez. Yayınlamak için gerekli (Çok yakında projeler hariç).',
} as const;

export default function ProjectForm({ mode, action, initial, id, expectedDraftUpdatedAt = '', slugLocked = false, canPublish = false }: Props) {
  const { state, pending, formAction, submitAs } = useIntentAction(action);
  const err = state.fieldErrors ?? {};
  const val = (k: keyof ProjectFormValues) => state.values?.[k] ?? initial[k];
  const slugHint = slugLocked ? HINT.slugLocked : HINT.slug;
  const comingSoon = state.values ? state.values.coming_soon === 'on' : initial.coming_soon === 'on';

  return (
    <form action={formAction} className="mt-8 space-y-6" noValidate>
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="expected_draft_updated_at" value={expectedDraftUpdatedAt} />

      {state.status === 'error' && state.message && (
        <p role="alert" className="rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
          {state.message}
        </p>
      )}

      <Field id="proj-title" label="BAŞLIK" error={err.title}>
        <input id="proj-title" name="title" defaultValue={val('title')} maxLength={160} required aria-invalid={!!err.title} aria-describedby={describedBy('proj-title', undefined, err.title)} className={inputClass} />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="proj-slug" label="SLUG" hint={slugHint} error={err.slug}>
          <input id="proj-slug" name="slug" defaultValue={val('slug')} readOnly={slugLocked} maxLength={120} aria-invalid={!!err.slug} aria-describedby={describedBy('proj-slug', slugHint, err.slug)} className={`${inputClass} font-mono`} />
        </Field>
        <Field id="proj-subtitle" label="ALT BAŞLIK" hint={HINT.subtitle} error={err.subtitle}>
          <input id="proj-subtitle" name="subtitle" defaultValue={val('subtitle')} maxLength={200} aria-invalid={!!err.subtitle} aria-describedby={describedBy('proj-subtitle', HINT.subtitle, err.subtitle)} className={inputClass} />
        </Field>
      </div>

      <Field id="proj-summary" label="ÖZET" hint={HINT.summary} error={err.summary}>
        <textarea id="proj-summary" name="summary" defaultValue={val('summary')} rows={4} maxLength={800} aria-invalid={!!err.summary} aria-describedby={describedBy('proj-summary', HINT.summary, err.summary)} className={inputClass} />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="proj-kind" label="TÜR" hint={HINT.kind} error={err.kind}>
          <FormSelect id="proj-kind" name="kind" value={val('kind')} aria-describedby={describedBy('proj-kind', HINT.kind, err.kind)} className={inputClass}>
            <option value="">(seçilmedi)</option>
            {PROJECT_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </FormSelect>
        </Field>
        <Field id="proj-type-label" label="TÜR ETİKETİ" hint={HINT.typeLabel} error={err.type_label}>
          <input id="proj-type-label" name="type_label" defaultValue={val('type_label')} maxLength={60} aria-invalid={!!err.type_label} aria-describedby={describedBy('proj-type-label', HINT.typeLabel, err.type_label)} className={inputClass} />
        </Field>
        <Field id="proj-category" label="KATEGORİ" hint={HINT.category} error={err.category}>
          <input id="proj-category" name="category" defaultValue={val('category')} maxLength={100} aria-invalid={!!err.category} aria-describedby={describedBy('proj-category', HINT.category, err.category)} className={inputClass} />
        </Field>
        <Field id="proj-accent" label="RENK" error={err.accent}>
          <FormSelect id="proj-accent" name="accent" value={val('accent')} className={inputClass}>
            <option value="blue">blue</option>
            <option value="green">green</option>
            <option value="orange">orange</option>
            <option value="purple">purple</option>
          </FormSelect>
        </Field>
        <Field id="proj-size" label="KART BOYUTU" error={err.size}>
          <FormSelect id="proj-size" name="size" value={val('size')} className={inputClass}>
            {PROJECT_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FormSelect>
        </Field>
        <Field id="proj-graphic" label="GRAFİK" error={err.graphic}>
          <FormSelect id="proj-graphic" name="graphic" value={val('graphic')} className={inputClass}>
            {PROJECT_GRAPHICS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </FormSelect>
        </Field>
        <Field id="proj-pill-label" label="DURUM ETİKETİ" hint={HINT.pill} error={err.project_status_label}>
          <input id="proj-pill-label" name="project_status_label" defaultValue={val('project_status_label')} maxLength={60} aria-invalid={!!err.project_status_label} aria-describedby={describedBy('proj-pill-label', HINT.pill, err.project_status_label)} className={inputClass} />
        </Field>
        <Field id="proj-pill-accent" label="DURUM ETİKETİ RENGİ" error={err.project_status_accent}>
          <FormSelect id="proj-pill-accent" name="project_status_accent" value={val('project_status_accent')} className={inputClass}>
            <option value="">(yok)</option>
            <option value="blue">blue</option>
            <option value="green">green</option>
            <option value="orange">orange</option>
            <option value="purple">purple</option>
          </FormSelect>
        </Field>
        <Field id="proj-sort" label="SIRA" hint={HINT.sort} error={err.sort_order}>
          <input id="proj-sort" name="sort_order" inputMode="numeric" defaultValue={val('sort_order')} aria-invalid={!!err.sort_order} aria-describedby={describedBy('proj-sort', HINT.sort, err.sort_order)} className={inputClass} />
        </Field>
      </div>

      <Field id="proj-tags" label="ETİKETLER" hint={HINT.tags} error={err.tags}>
        <input id="proj-tags" name="tags" defaultValue={val('tags')} aria-invalid={!!err.tags} aria-describedby={describedBy('proj-tags', HINT.tags, err.tags)} className={inputClass} />
      </Field>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="coming_soon" defaultChecked={comingSoon} className="mt-1" />
        <span>
          Çok yakında (yer tutucu kart)
          <span className="block text-muted">{HINT.comingSoon}</span>
        </span>
      </label>

      <Field id="proj-case" label="CASE STUDY (JSON)" hint={HINT.caseStudy} error={err.case_study}>
        <textarea
          id="proj-case"
          name="case_study"
          defaultValue={val('case_study')}
          rows={26}
          spellCheck={false}
          aria-invalid={!!err.case_study}
          aria-describedby={describedBy('proj-case', HINT.caseStudy, err.case_study)}
          className={`${inputClass} font-mono text-xs leading-relaxed`}
        />
      </Field>

      <SaveBar label={mode === 'create' ? 'Taslağı Oluştur' : 'Taslağı Kaydet'} pending={pending} submitAs={submitAs} />
      {mode === 'edit' && canPublish && <PublishPanel pending={pending} submitAs={submitAs} error={err.confirm_publish} />}
      {mode === 'create' && <p className="text-sm text-muted">Taslağı oluşturduktan sonra düzenleme sayfasından yayınlayabilirsiniz.</p>}
    </form>
  );
}
