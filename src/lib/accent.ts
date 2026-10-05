import type { Accent } from '@/types';

export const accentVar: Record<Accent, string> = {
  blue: 'var(--blue)',
  green: 'var(--green)',
  orange: 'var(--orange)',
  purple: 'var(--purple)',
};

export const dotClass: Record<Accent, string> = {
  blue: 'bg-electric',
  green: 'bg-acid',
  orange: 'bg-hot',
  purple: 'bg-volt',
};
