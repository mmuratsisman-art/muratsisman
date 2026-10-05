import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MURAT/LAB — Murat Şişman',
    short_name: 'MURAT/LAB',
    description: 'Murat Şişman — teknoloji, AI, altyapı ve dijital ürünler.',
    start_url: '/',
    display: 'standalone',
    lang: 'tr',
    background_color: '#0E1020',
    theme_color: '#0E1020',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
