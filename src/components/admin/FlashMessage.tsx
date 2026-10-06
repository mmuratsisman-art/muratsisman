import type { Flash } from '@/lib/cms/admin/flash';

export default function FlashMessage({ flash }: { flash: Flash | null }) {
  if (!flash) return null;
  return (
    <p
      role={flash.type === 'error' ? 'alert' : 'status'}
      className={`mt-6 rounded-xl border px-4 py-3 text-sm ${flash.type === 'error' ? 'border-hot' : 'border-acid'}`}
    >
      {flash.message}
    </p>
  );
}
