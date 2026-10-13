import type { Project, ProjectKind } from '@/types';

/**
 * Proje kartında gösterilen tür etiketi (Proje Vitrini 2.0 / FAZ 1B).
 * `ProjectKind` değerlerinden türetilir; yeni bir alan, tablo veya migration gerektirmez.
 * Record<ProjectKind, string>: yeni bir ProjectKind eklenirse etiketsiz kalması derleme hatasıdır.
 */
export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = {
  personal: 'Personal',
  work: 'Work',
  'ai-experiment': 'Experiment',
};

/**
 * Kart için tür etiketi. `kind` tanımlıysa türetilmiş etiket; yoksa (veya beklenmeyen bir değerse)
 * mevcut `typeLabel`; ikisi de yoksa undefined. Saf fonksiyondur: veri okumaz, yazmaz.
 */
export function projectKindLabel(p: Pick<Project, 'kind' | 'typeLabel'>): string | undefined {
  return derivedLabel(p.kind) ?? (p.typeLabel || undefined);
}

/** Etiket `kind`'dan türetildiyse true (typeLabel yedeği kullanılıyorsa false). Kart, biçimlendirmeyi buna göre seçer. */
export function isDerivedKindLabel(p: Pick<Project, 'kind'>): boolean {
  return derivedLabel(p.kind) !== undefined;
}

function derivedLabel(kind: string | undefined): string | undefined {
  return kind ? (PROJECT_KIND_LABEL as Partial<Record<string, string>>)[kind] : undefined;
}
