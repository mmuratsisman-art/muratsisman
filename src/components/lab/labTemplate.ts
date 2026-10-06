import type { LabStory } from '@/types';

/**
 * Lab detay sayfasının SABİT yapı etiketleri: şablonun parçasıdır, içerik değildir.
 * Sıra ve metinler burada; sahibi yalnızca LabEntry.description ve LabEntry.story alanlarını düzenler.
 */
export const LAB_EXPLORING_LABEL = "WHAT I'M EXPLORING";

export const LAB_STORY_SLOTS: { key: keyof LabStory; label: string }[] = [
  { key: 'why', label: 'WHY IT EXISTS' },
  { key: 'how', label: 'HOW IT WORKS' },
  { key: 'learned', label: 'WHAT I LEARNED' },
  { key: 'state', label: 'CURRENT STATE' },
];
