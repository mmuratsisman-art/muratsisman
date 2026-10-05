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
