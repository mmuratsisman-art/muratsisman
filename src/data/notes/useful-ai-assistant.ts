// SEED / EDITORIAL SCAFFOLDING: sahibi tarafından doğrulanmış kişisel beyan değildir. Yayından önce gerçek içerikle değiştirilecek.
import type { NoteEntry } from '@/types';

export const usefulAiAssistant: NoteEntry = {
  slug: "kullanisli-ai-asistani",
  title: "Bir AI asistanını gerçekten kullanışlı yapan nedir?",
  excerpt:
    "Kullanışlı bir AI asistanı için büyük bir prompt yetmez; bağlam, sınırlar ve net tanımlı bir iş gerekir.",
  publishedAt: "2026-10-06",
  tags: ["AI"],
  accent: "purple",
  content: [
    {
      kind: "p",
      text: "AI asistanları konuşulurken dikkat çoğunlukla modele ve prompt'un uzunluğuna gider. Bir asistanı kullanışlı yapan şeyler ise çoğu zaman başka yerdedir.",
    },
    { kind: "h", text: "Üç şey" },
    {
      kind: "list",
      items: [
        "Bağlam: asistan hangi bilgiyle çalışıyor ve bu bilgi doğru mu?",
        "Sınırlar: ne yapmalı, ne yapmamalı, emin olmadığında ne yapmalı?",
        "Net bir iş: tek cümleyle ne işe yaradığı söylenebiliyor mu?",
      ],
    },
    {
      kind: "p",
      text: "Bu üçü yoksa asistan, her şeyi biraz bilen ama hiçbir işte güvenilmeyen bir sohbet kutusuna dönüşür.",
    },
    { kind: "h", text: "Karar desteği" },
    {
      kind: "p",
      text: "En faydalı kullanım biçimi, insanın yerine geçmek değil karar desteği sağlamaktır. Asistan durumu yorumlar, olası yolları gösterir; son kararı ve sorumluluğu insan taşır.",
    },
    {
      kind: "p",
      text: "Bu hem hataları görünür kılar hem de asistanın neye yetip neye yetmediğini netleştirir.",
    },
  ],
};
