import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from './env';

/**
 * İstek bazlı Supabase istemcisi (kullanıcının oturumuyla, yani RLS geçerli).
 * Yapılandırma yoksa hata fırlatır; çağıranlar önce isSupabaseConfigured() kontrol etmelidir.
 */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) throw new Error('Supabase is not configured');

  const cookieStore = await cookies();

  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component içinden çağrıldıysa cookie yazılamaz: oturum yenilemeyi middleware yapar.
        }
      },
    },
  });
}
