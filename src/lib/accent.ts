import type { CSSProperties } from 'react';
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

export const accentStyle = (accent: Accent): CSSProperties =>
  ({ ['--card-accent' as string]: accentVar[accent] }) as CSSProperties;
