/**
 * Public sorguların seçtiği sütunlar (açık liste; `select('*')` YOK).
 * created_by/updated_by/seo_og/cover vb. iç alanlar public sorgulara hiç alınmaz.
 */
export const PROJECT_COLS =
  'slug, status, published_at, sort_order, title, subtitle, summary, accent, size, graphic, tags, coming_soon, kind, type_label, category, project_status_label, project_status_accent, case_study, seo_title, seo_description';
export const LAB_COLS =
  'slug, status, published_at, sort_order, title, short_title, type, experiment_status, summary, description, accent, featured, year, tags, story';
export const NOTE_COLS = 'slug, status, published_at, created_at, title, excerpt, content, tags, accent, reading_time_minutes';
export const SITE_COLS = 'key, data';
