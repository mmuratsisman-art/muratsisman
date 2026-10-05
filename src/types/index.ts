export type Accent = 'blue' | 'green' | 'orange' | 'purple';

export interface NavItem { id: string; label: string; href: string }
export interface CurrentlyItem { id: string; label: string; value: string; accent: Accent }

export type ProjectGraphicKind = 'rings' | 'flow' | 'nodes' | 'dots';
export type ProjectSize = 'feature' | 'standard' | 'teaser';

export interface Project {
  slug: string;
  index: string;
  title: string;
  subtitle: string;
  description: string;
  accent: Accent;
  size: ProjectSize;
  tags: string[];
  graphic: ProjectGraphicKind;
  comingSoon?: boolean;
}

export interface NoteItem {
  slug: string;
  title: string;
  category: 'AI' | 'Infrastructure' | 'Web' | 'Ideas';
  accent: Accent;
}
export interface LabCategory { id: string; label: string; accent: Accent }
export interface SocialLink { id: string; label: string; href: string }
