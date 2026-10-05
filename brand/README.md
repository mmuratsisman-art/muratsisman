# MURAT/LAB brand assets

| Dosya | Kullanım |
|---|---|
| `icon-ml.svg` | Primary mark **M/L** master (512 grid) — 32px ve üstü |
| `icon-m.svg` | Micro mark **M.** master (16 piksel grid) — yalnızca 16×16 favicon, M/L'nin küçültülmüşü DEĞİL |

Renkler: zemin `#0E1020`, harfler `#FFFFFF`, ayraç/nokta acid-green `#B6FF00`.

Türetilmiş çıktılar (tek kaynak: `public/`, `src/app/layout.tsx` içindeki `metadata.icons` ile bağlanır):
- `public/favicon.ico` → 16 (M.) + 32 (M/L)
- `public/icons/icon-16.png` → 16×16 M.
- `public/icons/icon-32.png` → 32×32 M/L
- `public/icons/apple-touch-icon.png` → 180×180 M/L (tam kare; iOS köşeleri kendisi yuvarlar)
- `public/icons/icon-192.png`, `icon-512.png` → `src/app/manifest.ts`

`src/app/` içinde `favicon.ico`, `icon*.png`, `apple-icon.png` OLMAMALI (file-convention ikonlar metadata.icons'u ezer ve çakışma yaratır).
