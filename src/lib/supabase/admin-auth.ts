import { notFound, redirect } from 'next/navigation';
import { createClient } from './server';
import { isSupabaseConfigured } from './env';

export type AdminSession =
  | { kind: 'admin'; userId: string; email: string | null }
  | { kind: 'forbidden'; email: string | null }
  | { kind: 'unconfigured' };

/**
 * /admin için SUNUCU TARAFI yetki kapısı. İstemci tarafında gizlemek yetkilendirme sayılmaz.
 *
 *  - Yapılandırma yok  → production: 404 (admin yüzeyi hiç görünmez), development: 'unconfigured'
 *  - Oturum yok        → /admin/login
 *  - Oturum var ama admin_users listesinde değil → 'forbidden' (hata durumunda da kapalı kalır)
 *
 * Yetki kaynağı veritabanıdır (public.is_admin()), RLS ile aynı: kullanıcı tarafından değiştirilebilen
 * JWT metadata'sına güvenilmez.
 */
export async function requireAdmin(): Promise<AdminSession> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === 'production') notFound();
    return { kind: 'unconfigured' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || isAdmin !== true) return { kind: 'forbidden', email: user.email ?? null };

  return { kind: 'admin', userId: user.id, email: user.email ?? null };
}
