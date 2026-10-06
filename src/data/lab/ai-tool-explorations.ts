// SEED / EDITORIAL SCAFFOLDING: sahibi tarafından doğrulanmış kişisel beyan değildir. Yayından önce gerçek içerikle değiştirilecek.
import type { LabEntry } from '@/types';

export const aiToolExplorations: LabEntry = {
  slug: "ai-tool-explorations",
  title: "AI TOOL EXPLORATIONS",
  shortTitle: "AI TOOLS",
  type: "EXPERIMENT",
  status: "EXPLORING",
  year: "2026",
  accent: "purple",
  featured: true,
  tags: ["AI", "Decision Support", "Assistants"],
  summary:
    "Odaklı AI asistanlarının yapılandırılmış bilgiyi işe yarar bir karar desteğine nasıl dönüştürebileceği üzerine bir keşif.",
  description:
    "Dar bir işi iyi yapan küçük AI asistanları: her şeyi bilen genel bir sohbet yerine, belirli bir bilgi kümesiyle ve net bir görevle çalışan, yapılandırılmış bilgiyi karar desteğine dönüştüren araçlar.",
  story: {
    why: [
      "Aynı model, görev tanımı ve bağlam değişince çok farklı davranabiliyor. Bu farkın nereden geldiğini küçük denemelerle anlamak, deneyin çıkış noktası.",
    ],
    how: [
      "Her deneme üç şeyi netleştirerek başlar: asistanın işi, kullanacağı bilgi ve sınırları. Ardından çıktılar küçük bir örnek set üzerinde değerlendirilir.",
      "Amaç hazır bir ürün çıkarmak değil; hangi tasarım kararının çıktıyı daha güvenilir yaptığını görmek.",
    ],
    learned: [
      "Net bir görev tanımı, uzun bir talimattan daha çok işe yarar.",
      "Asistanın emin olmadığı durumda ne yapacağını önceden belirlemek, çıktıyı daha güvenilir kılar.",
    ],
    state: ["Keşif sürüyor. Yeni denemeler yapıldıkça bu kayıt güncellenecek."],
  },
};
