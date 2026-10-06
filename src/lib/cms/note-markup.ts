import type { NoteBlock } from '@/types';

/**
 * Not gövdesi için bağımlılıksız metin işaretlemesi ↔ NoteBlock[] dönüşümü (deterministik, gidiş-dönüşte kayıpsız).
 *
 *   boş satır         → blok ayırıcı
 *   ## Başlık         → { kind: 'h' }
 *   > Alıntı          → { kind: 'quote' } (her '>' satırı ayrı blok)
 *   - Madde           → { kind: 'list' } (ardışık '- ' satırları tek liste)
 *   diğer satırlar    → { kind: 'p' } (ardışık satırlar tek paragraf, boşlukla birleşir)
 *   \## \> \- \\      → işaretin başındaki '\' ile kaçış (paragraf metni işaretle başlıyorsa)
 *
 * Blok metinlerindeki satır sonları serileştirirken boşluğa çevrilir (HTML'de zaten tek boşluk olarak görünür).
 */

export interface MarkupIssue {
  line: number;
  message: string;
}
export interface MarkupResult {
  blocks: NoteBlock[];
  issues: MarkupIssue[];
}

const HEADING = /^##(?:\s+(.*))?$/;
const QUOTE = /^>(?:\s+(.*))?$/;
const ITEM = /^-(?:\s+(.*))?$/;
const NEEDS_ESCAPE = /^(##(\s|$)|>(\s|$)|-(\s|$)|\\)/;

export function parseNoteMarkup(source: string): MarkupResult {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: NoteBlock[] = [];
  const issues: MarkupIssue[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: 'p', text: para.join(' ') });
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ kind: 'list', items: list });
      list = [];
    }
  };

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();

    if (line === '') {
      flushPara();
      flushList();
      return;
    }

    if (line.startsWith('\\') && NEEDS_ESCAPE.test(line.slice(1))) {
      flushList();
      para.push(line.slice(1));
      return;
    }

    const h = HEADING.exec(line);
    if (h) {
      flushPara();
      flushList();
      const text = (h[1] ?? '').trim();
      if (!text) issues.push({ line: n, message: 'Boş başlık (## sonrasına metin yazın).' });
      else blocks.push({ kind: 'h', text });
      return;
    }

    const q = QUOTE.exec(line);
    if (q) {
      flushPara();
      flushList();
      const text = (q[1] ?? '').trim();
      if (!text) issues.push({ line: n, message: 'Boş alıntı (> sonrasına metin yazın).' });
      else blocks.push({ kind: 'quote', text });
      return;
    }

    const it = ITEM.exec(line);
    if (it) {
      flushPara();
      const text = (it[1] ?? '').trim();
      if (!text) issues.push({ line: n, message: 'Boş liste maddesi (- sonrasına metin yazın).' });
      else list.push(text);
      return;
    }

    flushList();
    para.push(line);
  });

  flushPara();
  flushList();
  return { blocks, issues };
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

export function serializeNoteBlocks(blocks: NoteBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case 'h':
          return `## ${oneLine(b.text)}`;
        case 'quote':
          return `> ${oneLine(b.text)}`;
        case 'list':
          return b.items.map((it) => `- ${oneLine(it)}`).join('\n');
        default: {
          const t = oneLine(b.text);
          return NEEDS_ESCAPE.test(t) ? `\\${t}` : t;
        }
      }
    })
    .join('\n\n');
}
