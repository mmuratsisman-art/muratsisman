import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProjectForm from '@/components/admin/ProjectForm';
import PublicSiteNotice from '@/components/admin/PublicSiteNotice';
import { emptyProjectDoc, projectDocToFormValues } from '@/lib/cms/admin/project-form';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { createProjectAction } from '../actions';

export default async function NewProjectPage() {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  return (
    <div>
      <Link href="/admin/projects" className="font-mono text-xs tracking-widest text-muted hover:text-fg">
        ← PROJELER
      </Link>
      <h1 className="mt-4 font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">Yeni Proje</h1>
      <PublicSiteNotice />
      <ProjectForm mode="create" action={createProjectAction} initial={projectDocToFormValues(emptyProjectDoc())} />
    </div>
  );
}
