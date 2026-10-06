// SEED / EDITORIAL SCAFFOLDING: sahibi tarafından doğrulanmış kişisel beyan değildir. Yayından önce gerçek içerikle değiştirilecek.
import type { NoteEntry } from '@/types';

export const automationFriction: NoteEntry = {
  slug: "otomasyon-surtunmeyi-azaltmali",
  title: "Otomasyon sürtünmeyi azaltmalı, kontrolü değil",
  excerpt:
    "İyi otomasyon tekrar eden işi ortadan kaldırır, ama önemli kararları insanın görebileceği yerde bırakır.",
  publishedAt: "2026-10-02",
  tags: ["Automation", "Ideas"],
  accent: "green",
  content: [
    {
      kind: "p",
      text: "Otomasyon denince çoğu zaman \"işi tamamen devret\" fikri akla gelir. Oysa en çok işe yarayan otomasyonlar, işin sıkıcı kısmını alıp kararı insanda bırakanlardır.",
    },
    { kind: "h", text: "Sürtünme ile kontrol aynı şey değil" },
    {
      kind: "p",
      text: "Sürtünme; aynı bilgiyi tekrar girmek, bir adımı elle başlatmak, bir sonucu başka yere kopyalamak gibi işin kendisine katkısı olmayan yüktür. Kontrol ise bir şeyin yayına çıkıp çıkmayacağına, bir işlemin yapılıp yapılmayacağına karar verebilmektir.",
    },
    {
      kind: "p",
      text: "Birincisini azaltmak, ikincisini azaltmak anlamına gelmemeli.",
    },
    {
      kind: "list",
      items: [
        "Tekrar eden adımı otomatikleştir.",
        "Önemli kararı görünür tut.",
        "Bir şey ters giderse ne olduğu izlenebilir olsun.",
        "Otomasyonu geri alınabilir tasarla.",
      ],
    },
    { kind: "h", text: "Pratikte" },
    {
      kind: "p",
      text: "Bir akışı otomatikleştirirken yararlı bir soru şudur: bu adım atlanırsa ne olur? Cevap önemli bir şeyse adım kaldırılmaz; görünür ve onaylanabilir hale getirilir.",
    },
    { kind: "quote", text: "Otomasyon işi hızlandırmalı, ama kimin karar verdiğini gizlememeli." },
  ],
};
