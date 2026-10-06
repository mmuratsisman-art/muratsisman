'use server';

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

/**
 * E-posta + parola ile giriş. Kayıt (signUp) akışı bilerek YOK: kullanıcı yalnızca Supabase panelinden oluşturulur
 * ve ayrıca admin_users listesine eklenmedikçe hiçbir yetkisi olmaz.
 * Hata mesajları genel tutulur (kullanıcı varlığı sızdırılmaz).
 */
export async function signInAction(formData: FormData) {
  if (!isSupabaseConfigured()) notFound();

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) redirect('/admin/login?error=missing');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/admin/login?error=invalid');

  redirect('/admin');
}

export async function signOutAction() {
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}
