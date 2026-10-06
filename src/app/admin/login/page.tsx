import { notFound, redirect } from 'next/navigation';
import { signInAction } from '@/app/admin/actions';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

const MESSAGES: Record<string, string> = {
  missing: 'E-posta ve parola gerekli.',
  invalid: 'Giriş başarısız.',
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === 'production') notFound();
    return (
      <div className="shell py-16">
        <h1 className="font-display text-3xl font-extrabold">Admin yapılandırılmadı</h1>
        <p className="mt-4 max-w-xl text-muted">Supabase ortam değişkenleri tanımlı değil (bkz. docs/cms/SETUP.md).</p>
      </div>
    );
  }

  // Oturum varsa doğrudan admin'e (yetki kontrolünü orada layout yapar)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/admin');

  const { error } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  return (
    <div className="bg-bg">
      <div className="shell py-16 sm:py-24">
        <p className="font-mono text-xs tracking-widest text-muted">MURAT/LAB — ADMIN</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">Giriş</h1>

        <form action={signInAction} className="mt-8 max-w-sm space-y-5">
          {message && (
            <p role="alert" className="rounded-xl border border-fg/30 px-4 py-3 text-sm">
              {message}
            </p>
          )}
          <div>
            <label htmlFor="email" className="block font-mono text-xs tracking-widest text-muted">
              E-POSTA
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-2 w-full rounded-xl border border-fg/30 bg-surface px-4 py-3"
            />
          </div>
          <div>
            <label htmlFor="password" className="block font-mono text-xs tracking-widest text-muted">
              PAROLA
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-2 w-full rounded-xl border border-fg/30 bg-surface px-4 py-3"
            />
          </div>
          <button type="submit" className="rounded-full bg-acid px-6 py-3 font-semibold text-ink transition hover:-translate-y-0.5">
            Giriş yap
          </button>
        </form>
      </div>
    </div>
  );
}
