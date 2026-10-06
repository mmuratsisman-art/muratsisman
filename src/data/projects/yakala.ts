import type { Project } from '@/types';

export const yakala: Project = {
  slug: "yakala",
  index: "01",
  title: "YAKALA",
  subtitle: "Affiliate Commerce Platform",
  description:
    "Türkiye odaklı başlayan; fırsatları, kampanyaları ve indirimli ürünleri tek bir platformda buluşturmayı amaçlayan affiliate commerce projesi.",
  accent: "green",
  size: "feature",
  tags: ["Affiliate Commerce", "Feed Ingestion", "Offer Workflow", "AWIN", "Admitad"],
  graphic: "rings",
  kind: "personal",
  typeLabel: "PERSONAL PROJECT",
  category: "Affiliate Commerce Platform",
  status: { label: "ACTIVE DEVELOPMENT", accent: "green" },
  seo: {
    title: "YAKALA · Affiliate Commerce Platform",
    description:
      "Yakala: Türkiye odaklı bir affiliate commerce projesi. Feed'lerden gelen veriyi normalize eden ve fırsatları editoryal kontrolle yayınlayan platformun vaka çalışması.",
  },
  caseStudy: {
    slots: { diagramAfter: "problem" },
    sections: [
      {
        id: "overview",
        heading: "OVERVIEW",
        kind: "prose",
        body: [
          "Yakala, Türkiye odaklı başlayan bir affiliate commerce projesi. Amaç; fırsatları, kampanyaları ve indirimli ürünleri tek bir yerde, kullanıcının kolayca anlayabileceği biçimde sunmak.",
          "Yakala bir e-ticaret sitesi değil: satış yapmaz, kullanıcıyı ilgili satıcının sitesine yönlendirir.",
          "Proje yalnızca fırsat listeleyen statik bir site olarak düşünülmedi. Veriyi toplayan, düzenleyen ve yöneten bir sistem olarak geliştiriliyor.",
        ],
      },
      {
        id: "idea",
        heading: "THE IDEA",
        kind: "prose",
        body: [
          "Fırsatlar farklı kaynaklarda, farklı biçimlerde duruyor. Fikir, bu dağınık veriyi tek bir düzene sokmak ve kullanıcıya anlamlı fırsatlar halinde sunmaktı.",
          "Bunun için affiliate network'lerden ve product feed'lerden gelen verinin toplanması, normalize edilmesi ve yönetilmesi projenin merkezinde yer alıyor.",
        ],
      },
      {
        id: "problem",
        heading: "THE PROBLEM",
        kind: "prose",
        body: [
          "Affiliate network'ler ve satıcılar veriyi kendi formatlarında paylaşır: XML, CSV ya da JSON. Alan adları, kategori yapıları ve güncellenme sıklıkları kaynaktan kaynağa değişir.",
          "Bu veriyi olduğu gibi yayınlamak tutarsız ve eskimiş bir vitrin ortaya çıkarır. Hem veri akışını hem de neyin yayına çıkacağını yönetmek gerekir.",
        ],
      },
      {
        id: "built",
        heading: "WHAT I BUILT",
        kind: "prose",
        body: [
          "Yakala'yı bir vitrin olarak değil, arkasında yönetilebilir bir veri akışı olan bir platform olarak kurdum. Ön yüz fırsatları gösterir; asıl iş yönetim tarafında olur.",
          "Reklamveren / satıcı yapısı, affiliate network entegrasyonları ve feed kaynakları ayrı kavramlar olarak ele alınıyor. Admin panelinden satıcılar, feed kaynakları ve fırsatlar yönetiliyor.",
        ],
      },
      {
        id: "how",
        heading: "HOW IT WORKS",
        kind: "prose",
        body: [
          "Kaynak AWIN, Admitad ya da doğrudan / özel bir feed olabilir. Gelen veri içeri alınır, ortak bir yapıya normalize edilir ve fırsat adayı haline gelir.",
          "Her aday doğrudan yayına çıkmaz. Bekleyen fırsatlar admin panelinde incelenir, onaylananlar kullanıcıya sunulur. Otomasyon hız kazandırırken editoryal kontrol korunur.",
          "Yönetim tarafında feed ve ürün verisinin ne kadar güncel olduğu görülebilir.",
        ],
      },
      {
        id: "capabilities",
        heading: "KEY CAPABILITIES",
        kind: "list",
        items: [
          { title: "Affiliate network entegrasyonları", text: "AWIN, Admitad ve doğrudan / özel feed kaynakları için ortak bir yapı." },
          { title: "XML / CSV / JSON feed desteği", text: "Farklı formatlardaki ürün verisini içeri alma ve normalize etme." },
          { title: "Offer management", text: "Fırsatların yönetim panelinden oluşturulması, düzenlenmesi ve yayınlanması." },
          { title: "Pending deal approval", text: "Bekleyen fırsatlar için onay akışı: yayın öncesi insan kontrolü." },
          { title: "Merchant management", text: "Reklamveren / satıcı yapısının panelden yönetimi." },
          { title: "Feed source management", text: "Feed kaynaklarının tanımlanması ve izlenmesi." },
          { title: "Slug kontrolleri", text: "Fırsat ve satıcı sayfaları için URL yapısı üzerinde kontrol." },
          { title: "Sitemap / robots yapısı", text: "Arama motorlarının siteyi doğru taramasını destekleyen yapı." },
          { title: "Veri güncelliği görünürlüğü", text: "Feed ve ürün verisinin ne kadar güncel olduğunu yönetim tarafında görebilme." },
          { title: "Responsive ön yüz", text: "Mobil ve masaüstünde kullanılabilir fırsat deneyimi." },
        ],
      },
      {
        id: "status",
        heading: "CURRENT STATUS",
        kind: "prose",
        body: [
          "Yakala aktif geliştirme aşamasında ve yeni özelliklerle gelişmeye devam ediyor.",
          "Bu sayfa projenin yönünü ve yaklaşımını anlatıyor. Teknik stack ve daha fazla ayrıntı ileride eklenecek.",
        ],
      },
      {
        id: "learned",
        heading: "WHAT I LEARNED",
        kind: "list",
        variant: "numbered",
        items: [
          { title: "Veriyi normalize etmek işin temeli", text: "Farklı kaynaklardan gelen veri ortak bir yapıya getirilmeden güvenilir bir ürüne dönüşmüyor." },
          { title: "Otomasyon ile editoryal kontrol arasında denge", text: "Her şeyi otomatikleştirmek hızlı ama riskli. Neyin elle kontrol edileceğine karar vermek tasarımın bir parçası." },
          { title: "Veri güncelliği güveni belirliyor", text: "Affiliate sistemlerinde eskimiş veri kullanıcı güvenini doğrudan etkiliyor. Güncelliği görünür kılmak gerekiyor." },
          { title: "Fikirden ürüne iteratif gidiliyor", text: "Bir fikri çalışan ürüne dönüştürmek tek adımda olmuyor. Parçalar çalışır hale geldikçe yön netleşiyor." },
        ],
      },
    ],
    tags: [
      "Affiliate Commerce",
      "Product Feeds",
      "Feed Ingestion",
      "Offer Workflow",
      "Merchant Management",
      "Editorial Control",
      "Data Normalization",
      "XML / CSV / JSON",
      "AWIN",
      "Admitad",
    ],
    diagram: {
      kind: "commerce",
      heading: "FROM SOURCE TO OPPORTUNITY",
      steps: [
        { label: "Affiliate Sources", caption: "Affiliate network'ler ve doğrudan feed'ler.", chips: ["AWIN", "Admitad", "Direct / Custom"] },
        { label: "Feed Ingestion", caption: "XML, CSV ya da JSON olarak gelen veri içeri alınır." },
        { label: "Normalization", caption: "Farklı yapılar ortak bir veri modeline getirilir." },
        { label: "Offer Workflow", caption: "Fırsat adayları admin panelinde incelenir ve onaylanır." },
        { label: "Published Opportunity", caption: "Onaylanan fırsat kullanıcıya sunulur." },
      ],
    },
  },
};
