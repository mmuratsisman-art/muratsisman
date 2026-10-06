// SEED / EDITORIAL SCAFFOLDING: sahibi tarafından doğrulanmış kişisel beyan değildir. Yayından önce gerçek içerikle değiştirilecek.
import type { LabEntry } from '@/types';

export const webProductExperiments: LabEntry = {
  slug: "web-product-experiments",
  title: "WEB PRODUCT EXPERIMENTS",
  shortTitle: "WEB PRODUCT",
  type: "PROTOTYPE",
  status: "EXPLORING",
  year: "2026",
  accent: "orange",
  featured: true,
  tags: ["Web", "Product", "Prototypes"],
  summary: "Arayüz, ürün ve otomasyon fikirlerinin daha büyük projelere dönüşmeden önce denendiği alan.",
  description:
    "Bir fikri tam ürün olarak kurmadan önce onun en küçük çalışan hali denenir: tek bir ekran, tek bir akış, tek bir soru. Amaç, fikrin işe yarayıp yaramadığını erken görmek.",
  story: {
    why: [
      "Büyük bir sistemi kurmadan önce hangi varsayımların doğru olduğunu öğrenmek zaman kazandırır. Bu alan, o varsayımları ucuza test etmek için var.",
    ],
    how: [
      "Bir prototip tek bir soruya cevap vermek için kurulur. Soru cevaplandığında prototip ya bir projeye dönüşür ya da bırakılır.",
      "Arayüz ve ürün kararları birlikte denenir; çünkü biri diğerini şekillendirir.",
    ],
    learned: [
      "Küçük bir prototip, uzun bir tasarım belgesinden daha hızlı geri bildirim sağlar.",
      "Neyin gereksiz olduğu çoğu zaman ancak denenerek fark edilir.",
    ],
    state: ["Keşif sürüyor. Anlamlı bir yöne giden bir prototip ileride Selected Projects altına taşınabilir."],
  },
};
