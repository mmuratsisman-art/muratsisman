import type { ReactNode } from 'react';

export const inputClass =
  'mt-2 w-full rounded-xl border border-fg/30 bg-surface px-4 py-3 text-base read-only:bg-fg/5 read-only:text-muted';

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block font-mono text-xs tracking-widest text-muted">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}

export const describedBy = (id: string, hint?: string, error?: string) => [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
