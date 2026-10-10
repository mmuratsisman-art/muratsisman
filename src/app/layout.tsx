import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { getChromeIdentity } from '@/lib/content';
import { socialMetadata } from '@/lib/seo/social';

const display = Bricolage_Grotesque({ subsets: ['latin', 'latin-ext'], variable: '--font-display', display: 'swap' });
const sans = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin', 'latin-ext'], variable: '--font-mono', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  // static modunda src/data/site.ts; cms modunda site_meta (okunamazsa YALNIZCA kimlik alanları için statik değerler)
  const siteConfig = await getChromeIdentity();
  const defaultTitle = `${siteConfig.brand.left}/${siteConfig.brand.right} — ${siteConfig.name}`;
  return {
  metadataBase: new URL(`https://${siteConfig.domain}`),
  title: { default: defaultTitle, template: `%s — MURAT/LAB` },
  description: siteConfig.description,
  // Site geneli paylaşım kartı (ana sayfa ve kendi kartı olmayan sayfalar devralır); başlık/açıklama yukarıdakilerle aynı.
  ...socialMetadata({ title: defaultTitle, description: siteConfig.description }),
  // Tek kaynak: public/ altındaki dosyalar. app/ içinde file-convention ikon YOK (çakışma olmasın).
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', sizes: '16x16 32x32', type: 'image/x-icon' },
      { url: '/icons/icon-16.png?v=2', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-32.png?v=2', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' }],
  },
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// İlk boyamadan önce tema uygula (flash yok): kayıtlı tercih → sistem tercihi.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${display.variable} ${sans.variable} ${mono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
