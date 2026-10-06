import AdminPlaceholder from '@/components/admin/AdminPlaceholder';
import { adminSections } from '@/lib/cms/admin-sections';

const section = adminSections.find((s) => s.href === '/admin/seo');

export default function AdminSeoPage() {
  if (!section) return null;
  return <AdminPlaceholder section={section} />;
}
