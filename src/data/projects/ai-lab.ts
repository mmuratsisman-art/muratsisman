import type { Project } from '@/types';

export const aiLab: Project = {
  slug: "ai-lab",
  index: "03",
  title: "AI LAB",
  subtitle: "AI Assistants & Operational AI",
  description:
    "Gerçek operasyon problemlerini AI ile çözmek için geliştirilen asistanların, bilgi sistemlerinin ve deneylerin toplandığı alan.",
  accent: "purple",
  size: "standard",
  tags: ["AI Assistants", "Operational AI", "Knowledge Retrieval"],
  graphic: "nodes",
  kind: "ai-experiment",
  typeLabel: "AI / EXPERIMENT",
  category: "AI Assistants & Operational AI",
  status: { label: "ONGOING", accent: "purple" },
  seo: {
    title: "AI LAB · AI Assistants & Operational AI",
    description:
      "AI LAB: Gerçek operasyon problemlerini çözmek için geliştirilen AI asistanları ve deneyler. İlk öne çıkan vaka: Heimdall.",
  },
  caseStudy: {
    slots: { casesAfter: "approach" },
    sections: [
      {
        id: "overview",
        heading: "OVERVIEW",
        kind: "prose",
        body: [
          "AI LAB tek bir uygulama değil. Gerçek operasyon problemlerini AI ile çözmek için geliştirilen asistanların, bilgi sistemlerinin ve deneylerin toplandığı bir alan.",
          "Burada hem iş ortamında geliştirilen çözümler hem de kişisel deneyler yer alır. Her vaka problemden başlar, AI çözümüne ve operasyonel değere doğru ilerler.",
        ],
      },
      {
        id: "approach",
        heading: "THE APPROACH",
        kind: "prose",
        body: [
          "Yaklaşım basit: önce operasyondaki gerçek problemi tanımlamak, sonra AI'nın hangi noktada karar desteği sağlayabileceğini bulmak.",
          "AI çıktısının yalnızca bir cevap olması yetmiyor. Doğru yönlendirme ve bağlam olmadan cevap, operasyonda işe yaramıyor.",
        ],
      },
      {
        id: "status",
        heading: "CURRENT STATUS",
        kind: "prose",
        body: [
          "AI LAB, operasyonel problemlerde yapay zekânın nasıl karar desteğine dönüştürülebileceğini araştırdığım ve geliştirdiğim çalışmaların devam eden alanıdır.",
        ],
      },
      {
        id: "learned",
        heading: "WHAT I LEARNED",
        kind: "list",
        variant: "numbered",
        items: [
          { title: "Cevap vermek tek başına yetmiyor", text: "Operasyonel AI sistemlerinde asıl değer, cevabın doğru yönlendirmeyle ve bağlamla gelmesi." },
          { title: "Bağlam ve yönlendirme belirleyici", text: "Aynı soru farklı bağlamda farklı bir adım gerektirebiliyor. Bağlamı doğru kurmak işin büyük kısmı." },
          { title: "Teknik hatayı anlaşılır yanıta çevirmek ayrı bir problem", text: "Bir hata mesajını yorumlamak ile bunu müşterinin anlayacağı bir cevaba dönüştürmek farklı beceriler istiyor." },
          { title: "AI temsilcinin yerine geçmiyor, karar desteği sağlıyor", text: "En değerli kullanım, insanın kararını hızlandıran ve netleştiren bir destek katmanı olmak." },
        ],
      },
    ],
    tags: ["AI Assistants", "Operational AI", "Knowledge Retrieval", "Decision Support", "Root-Cause Assistance"],
    cases: [
      {
        id: "heimdall",
        name: "HEIMDALL",
        typeLabel: "WORK PROJECT / AI ASSISTANT",
        accent: "purple",
        summary:
          "Giden ve gelen e-posta sorunlarında destek temsilcilerinin sorularını yanıtlayan ve doğru yönlendirmeyi sağlayan, iş ortamında geliştirilen AI destekli bir asistan.",
        diagramAfter: "solution",
        sections: [
          {
            id: "problem",
            heading: "THE PROBLEM",
            kind: "prose",
            body: [
              "Destek temsilcileri giden ve gelen e-posta sorunlarıyla sık karşılaşır. Posta sistemlerinin verdiği teknik yanıtları yorumlamak zaman alır ve alan bilgisi gerektirir.",
            ],
          },
          {
            id: "solution",
            heading: "THE SOLUTION",
            kind: "prose",
            body: [
              "Heimdall, AI destekli bir operasyonel bilgi katmanı olarak çalışır. Temsilcinin e-posta sorununu yorumlamasına, posta sistemi hata yanıtlarını anlamasına, olası kök nedeni belirlemesine ve müşteriye iletilecek net bir yanıt hazırlamasına yardımcı olur.",
            ],
          },
          {
            id: "capabilities",
            heading: "CAPABILITIES",
            kind: "list",
            items: [
              { title: "Gelen e-posta sorunları", text: "Alım tarafındaki sorunlarda temsilciye yönlendirme." },
              { title: "Giden e-posta sorunları", text: "Gönderim tarafındaki sorunlarda temsilciye yönlendirme." },
              { title: "E-posta hata analizi", text: "Posta sistemi hata yanıtlarının teknik olarak yorumlanması." },
              { title: "Kök neden desteği", text: "Hatanın olası kaynağının belirlenmesine yardım." },
              { title: "Temsilci yönlendirmesi", text: "Uygulanacak kontrol ve adımların sunulması." },
              { title: "Müşteri yanıtı taslağı", text: "Müşteriye iletilecek yanıtın hazırlanmasına destek." },
              { title: "Operasyonel bilgiye erişim", text: "Gerekli bilginin doğru bağlamda temsilciye ulaştırılması." },
            ],
          },
          {
            id: "value",
            heading: "OPERATIONAL VALUE",
            kind: "prose",
            body: [
              "Heimdall'ın değeri temsilcinin yerine geçmesi değil, karar desteği sağlaması. Teknik bir hata mesajını anlaşılır bir yönlendirmeye ve müşterinin diliyle bir yanıta dönüştürmek ayrı bir problem; Heimdall bu adımı hızlandırmayı hedefliyor.",
            ],
          },
        ],
        diagram: {
          kind: "ai-assist",
          heading: "FROM QUESTION TO RESPONSE",
          steps: [
            { label: "Question / Email Error", caption: "Temsilcinin sorusu ya da bir e-posta hata yanıtı." },
            { label: "AI Analysis", caption: "Hata ve bağlam yorumlanır." },
            { label: "Likely Root Cause", caption: "Olası kök neden belirlenir." },
            { label: "Representative Guidance", caption: "Temsilciye kontrol ve yönlendirme adımları sunulur." },
            { label: "Customer Response Draft", caption: "Müşteriye iletilecek yanıtın taslağı hazırlanır." },
          ],
        },
        tags: ["AI Assistant", "Operational Knowledge", "Root-Cause Assistance", "Decision Support"],
      },
    ],
  },
};
