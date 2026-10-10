import type { Metadata } from 'next';
import { ensureDynamicIfCms } from '@/lib/content/dynamic';
import Hero from '@/components/hero/Hero';
import Currently from '@/components/sections/Currently';
import SelectedProjects from '@/components/sections/SelectedProjects';
import Lab from '@/components/sections/Lab';
import Notes from '@/components/sections/Notes';
import About from '@/components/sections/About';
import Contact from '@/components/sections/Contact';

// Başlık/açıklama/paylaşım kartı kök layout'tan gelir; yalnızca kanonik adres burada tanımlanır (metadataBase ile https://<alan>/ olur).
export const metadata: Metadata = { alternates: { canonical: '/' } };

export default async function HomePage() {
  await ensureDynamicIfCms();
  return (
    <>
      <Hero />
      <Currently />
      <SelectedProjects />
      <Lab />
      <Notes />
      <About />
      {/* FAZ 3: <MuratExe /> buraya gelecek */}
      <Contact />
    </>
  );
}
