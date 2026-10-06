# MURAT/LAB — muratsisman.com.tr (FAZ 1)

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run lint   # eslint . (flat config)
npm run build
```

İçerik: `src/data/*`. Tema/renk token'ları: `src/app/globals.css`.
Placeholder'lar: sosyal linkler (`src/data/social.ts`), e-posta adresi, proje açıklamaları.

## QA
`scripts/qa.mjs` — 5 viewport × light/dark × reduced-motion için overflow / data-theme / console hatası kontrolü + tam sayfa screenshot (`qa-shots/`).

## CMS (FAZ 3A: temel altyapı)
Herkese açık içerik hâlâ `src/data/*` dosyalarından gelir. Supabase tabanlı admin altyapısı hazırlanıyor ancak **etkin değil**:
`docs/cms/ARCHITECTURE.md`, `docs/cms/SECURITY.md`, `docs/cms/CONTENT-MIGRATION.md`, `docs/cms/SETUP.md`.
Ortam değişkenleri isteğe bağlıdır (`.env.example`); olmadan `typecheck / lint / build` ve tüm herkese açık rotalar çalışır.
Doğrulama durumu (kim neyi doğruladı): `docs/cms/VERIFICATION.md`. Migration iş akışı: `supabase/README.md`.
