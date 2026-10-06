// SEED / EDITORIAL SCAFFOLDING: sahibi tarafından doğrulanmış kişisel beyan değildir. Yayından önce gerçek içerikle değiştirilecek.
import type { LabEntry } from '@/types';

export const automationPlayground: LabEntry = {
  slug: "automation-playground",
  title: "AUTOMATION PLAYGROUND",
  shortTitle: "AUTOMATION",
  type: "EXPERIMENT",
  status: "ACTIVE",
  year: "2026",
  accent: "green",
  featured: true,
  tags: ["Automation", "Workflow", "Mini Tools"],
  summary: "Dijital iş akışlarındaki tekrar eden adımları ortadan kaldırmaya yönelik küçük denemeler.",
  description:
    "Küçük, tek amaçlı otomasyon denemeleri: bir akıştaki tekrar eden adımı bulmak, onu en basit haliyle kaldırmak ve geriye kalan kararı insanın görebileceği yerde bırakmak.",
  story: {
    why: [
      "Tekrar eden küçük işler zamanla büyük bir yüke dönüşüyor. Hangilerinin gerçekten otomatikleştirmeye değer olduğunu görmek için önce küçük denemeler yapmak daha az riskli.",
    ],
    how: [
      "Her deneme tek bir adımı hedefler: girdi, yapılacak iş ve sonuç nettir. Sonuç bir sonraki akışa geçmeden önce kontrol edilebilir durumda kalır.",
      "Çalışırsa genişletilir; çalışmazsa nedeni not edilir.",
    ],
    learned: [
      "Otomasyonun değeri çoğu zaman hızından çok öngörülebilir olmasındadır.",
      "Karar noktalarını görünür tutmak, otomasyona güveni artırır.",
    ],
    state: ["Aktif. Yeni denemeler eklendikçe burada toplanacak."],
  },
};
