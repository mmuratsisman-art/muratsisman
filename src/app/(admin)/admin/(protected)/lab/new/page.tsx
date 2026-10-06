import Link from 'next/link';
import { notFound } from 'next/navigation';
import LabForm from '@/components/admin/LabForm';
import PublicSiteNotice from '@/components/admin/PublicSiteNotice';
import { emptyLabDoc, labDocToFormValues } from '@/lib/cms/admin/lab-form';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { createLabEntryAction } from '../actions';

export default async function NewLabEntryPage() {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  return (
    <div>
      <Link href="/admin/lab" className="font-mono text-xs tracking-widest text-muted hover:text-fg">
        ← LAB
      </Link>
      <h1 className="mt-4 font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">Yeni Deney</h1>
      <PublicSiteNotice />
      <LabForm mode="create" action={createLabEntryAction} initial={labDocToFormValues(emptyLabDoc())} />
    </div>
  );
}
