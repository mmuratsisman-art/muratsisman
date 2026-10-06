import type { Project } from '@/types';

export const migrationCenter: Project = {
  slug: "migration-center",
  index: "02",
  title: "MIGRATION CENTER",
  subtitle: "Website Migration Automation",
  description:
    "Kurumsal hosting operasyonlarında manuel yürütülen web sitesi taşıma işlemlerini tek bir arayüz ve kontrollü bir workflow altında toplayan otomasyon çalışması.",
  accent: "blue",
  size: "standard",
  tags: ["FTP", "IMAP", "MySQL / MariaDB", "Migration Workflow", "Reliability"],
  graphic: "flow",
  kind: "work",
  typeLabel: "WORK PROJECT",
  category: "Website Migration Automation",
  seo: {
    title: "MIGRATION CENTER · Website Migration Automation",
    description:
      "Migration Center: Kurumsal hosting operasyonlarında web sitesi taşıma işlemlerini kontrollü bir workflow altında otomatikleştiren çalışmanın vaka çalışması.",
  },
  caseStudy: {
    slots: { diagramAfter: "idea" },
    sections: [
      {
        id: "overview",
        heading: "OVERVIEW",
        kind: "prose",
        body: [
          "Migration Center, kurumsal hosting operasyonlarında geliştirdiğim bir çalışma. Web sitesi taşıma işlemlerini, operasyon ekiplerinin elle yürüttüğü adımlardan merkezi ve kontrollü bir workflow'a taşımayı amaçlıyor.",
        ],
      },
      {
        id: "problem",
        heading: "THE OPERATIONAL PROBLEM",
        kind: "prose",
        body: [
          "Bir web sitesini taşımak tek bir işlem değil. Operasyon ekipleri geleneksel olarak dosyaları FTP ile taşır, veritabanını export/import eder, hosting paneli üzerinde işlem yapar, e-postaları taşır ve tüm bunların takibini ayrıca yürütür.",
          "Her adım elle yapıldığında süreç hataya açık hale gelir. Yarıda kalan ya da tekrarlanan bir adım ayrıca yönetilmesi gereken bir durumdur.",
        ],
      },
      {
        id: "idea",
        heading: "THE IDEA",
        kind: "prose",
        body: [
          "Fikir, bu adımları ayrı ayrı işlemler olarak bırakmak yerine tek bir migration workflow'u altında toplamaktı: kaynak ve hedef bağlantısı tanımlanır, taşınacak içerik seçilir ve süreç bir kuyruk üzerinden, ilerlemesi izlenerek çalışır.",
          "Otomasyonun amacı insan kontrolünü ortadan kaldırmak değil, süreci güvenli ve izlenebilir hale getirmekti.",
        ],
      },
      {
        id: "workflow",
        heading: "THE WORKFLOW",
        kind: "prose",
        body: [
          "Akış, kaynak ve hedef bağlantısının tanımlanmasıyla başlar. Erişim kontrollü biçimde sağlanır, taşınacak kalemler seçilir ve iş sıraya alınır.",
          "İşler adım adım ve kontrollü biçimde yürütülür. Her işin ilerlemesi izlenir; operasyon ekibi sürecin hangi aşamada olduğunu arayüzden görebilir.",
          "Siteleri tek tek girmek yerine, CSV ile toplu migration başlatmak da mümkündür.",
        ],
      },
      {
        id: "automated",
        heading: "WHAT WAS AUTOMATED",
        kind: "list",
        items: [
          { title: "Web sitesi dosyaları", text: "FTP üzerinden dosya taşıma adımı." },
          { title: "Veritabanı", text: "MySQL / MariaDB için export/import. MSSQL tarafında mimari ve destek çalışması." },
          { title: "E-posta", text: "IMAP üzerinden e-posta taşıma." },
          { title: "Bağlantı akışı", text: "Kaynak ve hedef bağlantılarının tek bir akışta tanımlanması." },
          { title: "Toplu migration", text: "CSV ile birden fazla taşıma işinin tek seferde başlatılması." },
          { title: "İlerleme ve yönetim", text: "İlerleme takibi ve operasyon ekibi için admin paneli." },
          { title: "Hedef ortam hazırlığı", text: "Hedef tarafında provisioning çalışması." },
        ],
      },
      {
        id: "reliability",
        heading: "RELIABILITY & SAFETY",
        kind: "list",
        items: [
          { title: "CONTROLLED RETRIES", text: "Geçici hatalarda işlemlerin kontrollü biçimde yeniden ele alınması." },
          { title: "PROCESS VISIBILITY", text: "Taşıma sürecinin ilerlemesinin ve durumunun izlenebilir olması." },
          { title: "SAFE EXECUTION", text: "Tekrarlanan veya yarıda kalan işlemlerde tutarlı sonuç üretmeye odaklanan çalışma yaklaşımı." },
          { title: "CONTROLLED ACCESS", text: "Operasyon akışına güvenli ve kontrollü erişim." },
          { title: "FAULT TOLERANCE", text: "Hata senaryolarında sürecin güvenilir davranmasını doğrulamaya yönelik test yaklaşımı." },
        ],
      },
      {
        id: "status",
        heading: "CURRENT STATUS",
        kind: "prose",
        body: [
          "Migration Center, kurumsal operasyon ihtiyaçları için geliştirilen bir otomasyon çalışmasıdır. Bu sayfa projenin yaklaşımını, çözdüğü problemi ve mühendislik prensiplerini kavramsal düzeyde anlatır.",
        ],
      },
      {
        id: "learned",
        heading: "WHAT I LEARNED",
        kind: "list",
        variant: "numbered",
        items: [
          { title: "Otomasyonda asıl mesele güvenilirlik", text: "Manuel bir işi otomatikleştirdiğinizde ağırlık hızdan çok güvenilirliğe kayıyor." },
          { title: "Retry, idempotency ve ilerleme takibi temel", text: "Gerçek operasyonlarda bu mekanizmalar süs değil, işin kendisi." },
          { title: "Tek işlem aslında birçok süreç", text: "\"Dosya taşıma\" dediğimiz şey; bağlantı, veritabanı, e-posta ve doğrulama gibi birbirine bağlı birçok adımdan oluşuyor." },
          { title: "Otomasyon kontrolü kaldırmıyor", text: "Doğru hedef insan kontrolünü tamamen kaldırmak değil, süreci güvenli hale getirmek." },
        ],
      },
    ],
    tags: [
      "FTP",
      "IMAP",
      "MySQL / MariaDB",
      "MSSQL",
      "Migration Workflow",
      "Process Tracking",
      "Reliability",
      "Fault Tolerance",
    ],
    diagram: {
      kind: "migration",
      heading: "THE MIGRATION FLOW",
      steps: [
        { label: "Source", caption: "Taşınacak sitenin kaynak bağlantısı tanımlanır." },
        { label: "Migration Workflow", caption: "İş sıraya alınır, adımlar kontrollü biçimde yürütülür ve ilerleme izlenir." },
        { label: "Files / Database / Email", caption: "Dosya, veritabanı ve e-posta taşıma adımları.", chips: ["Files", "Database", "Email"] },
        { label: "Validation", caption: "Taşıma sonrası kontrol; hata durumunda yeniden deneme." },
        { label: "Destination", caption: "İçerik hedef ortamda tamamlanır." },
      ],
    },
  },
};
