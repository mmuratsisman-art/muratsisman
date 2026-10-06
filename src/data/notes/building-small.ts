// SEED / EDITORIAL SCAFFOLDING: sahibi tarafından doğrulanmış kişisel beyan değildir. Yayından önce gerçek içerikle değiştirilecek.
import type { NoteEntry } from '@/types';

export const buildingSmall: NoteEntry = {
  slug: "buyuk-kurmadan-once-kucuk-kurmak",
  title: "Büyük kurmadan önce küçük kurmak",
  excerpt:
    "Bir fikri tam sistem olarak tasarlamak yerine çalışan küçük bir sürümünü denemek, çoğu zaman daha hızlı ve daha dürüst bir öğrenme sağlar.",
  publishedAt: "2026-09-28",
  tags: ["Ideas", "Web"],
  accent: "orange",
  content: [
    {
      kind: "p",
      text: "Bir fikir ortaya çıktığında ilk refleks çoğu zaman bütün sistemi düşünmek olur: veri modeli, yönetim paneli, kullanıcı akışları, ölçeklenme. Kâğıt üzerinde hepsi mantıklı görünür. Ama kâğıttaki sistem, henüz hiçbir şeyi test etmemiş bir varsayımlar yığınıdır.",
    },
    { kind: "h", text: "Küçük sürüm ne öğretir" },
    {
      kind: "p",
      text: "Küçük ve çalışan bir sürüm tek bir soruya cevap verir: bu fikir gerçekten işe yarıyor mu? Eksik parçalar da kendiliğinden görünür hale gelir. Hangi adımın sanılandan zor olduğu, hangisinin hiç gerekmediği ancak denerken anlaşılır.",
    },
    {
      kind: "list",
      items: [
        "Önce tek bir akışı uçtan uca çalıştır.",
        "Eksikleri not et ama hemen çözmeye kalkma.",
        "Neyin gerçekten gerekli olduğunu çalışan sürüm gösterir.",
      ],
    },
    { kind: "quote", text: "Tasarımın tamamını bitirmek yerine, çalışan en küçük parçayı bitirmek." },
    { kind: "h", text: "Sınırı" },
    {
      kind: "p",
      text: "Küçük başlamak, düşünmeden başlamak değildir. Küçük sürüm bile hangi soruyu cevaplayacağı bilinerek kurulmalıdır. Bu soru net değilse küçük sürüm de dağınık olur.",
    },
  ],
};
