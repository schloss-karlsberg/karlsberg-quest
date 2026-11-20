/**
 * Player-facing release notes (content/release-notes/vX.Y.Z.md): version ordering, the "unseen"
 * badge logic and a tiny, safe markdown subset. Pure (no DOM), so the title screen
 * (src/ui/news.ts), the build-time page `neu.html` (vite.config.ts) and the unit tests share it.
 *
 * Markdown subset: `#`–`####` headings, `-` / `*` list items, paragraphs (blank-line separated,
 * soft line breaks joined), `**bold**`. Everything else is plain text; HTML is always escaped.
 */

export interface ReleaseNote {
  /** "0.5.0" (no leading v) */
  version: string;
  markdown: string;
}

export type Inline = { bold: boolean; text: string };
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; inline: Inline[] }
  | { type: 'list'; items: Inline[][] }
  | { type: 'paragraph'; inline: Inline[] };

/** "v0.5.0.md", "/content/release-notes/v1.2.10.md" → "1.2.10"; anything else → null. */
export function versionFromPath(path: string): string | null {
  const m = /(?:^|\/)v?(\d+\.\d+\.\d+)\.md$/.exec(path);
  return m ? m[1]! : null;
}

/** Semver-ish compare of "X.Y.Z" (a leading v is ignored; missing parts count as 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Glob result ({ path: raw markdown }) → notes, newest first; files without a version are skipped. */
export function collectNotes(files: Record<string, string>): ReleaseNote[] {
  const out: ReleaseNote[] = [];
  for (const [path, markdown] of Object.entries(files)) {
    const version = versionFromPath(path);
    if (version) out.push({ version, markdown });
  }
  return out.sort((a, b) => compareVersions(b.version, a.version));
}

/** The badge shows while the newest note is newer than the last one the player opened. */
export function hasUnseen(latest: string | null | undefined, seen: string | null | undefined): boolean {
  if (!latest) return false;
  if (!seen) return true;
  return compareVersions(latest, seen) > 0;
}

/** `**bold**` spans; an unmatched `**` stays literal. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length) {
    const start = rest.indexOf('**');
    const end = start >= 0 ? rest.indexOf('**', start + 2) : -1;
    if (start < 0 || end < 0) {
      out.push({ bold: false, text: rest });
      break;
    }
    if (start > 0) out.push({ bold: false, text: rest.slice(0, start) });
    if (end > start + 2) out.push({ bold: true, text: rest.slice(start + 2, end) });
    rest = rest.slice(end + 2);
  }
  return out;
}

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', inline: parseInline(para.join(' ')) });
    para = [];
    if (list) blocks.push({ type: 'list', items: list });
    list = null;
  };
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const hm = /^(#{1,4})\s+(.*)$/.exec(line);
    if (hm) {
      flush();
      blocks.push({ type: 'heading', level: hm[1]!.length as 1 | 2 | 3 | 4, inline: parseInline(hm[2]!.trim()) });
      continue;
    }
    const lm = /^[-*]\s+(.*)$/.exec(line);
    if (lm) {
      if (para.length) {
        blocks.push({ type: 'paragraph', inline: parseInline(para.join(' ')) });
        para = [];
      }
      (list ??= []).push(parseInline(lm[1]!));
      continue;
    }
    if (list && /^\s/.test(raw)) {
      // indented continuation of the last list item
      const last = list[list.length - 1]!;
      last.push({ bold: false, text: ' ' }, ...parseInline(line));
      continue;
    }
    if (list) {
      blocks.push({ type: 'list', items: list });
      list = null;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inlineHtml(inline: Inline[]): string {
  return inline.map((i) => (i.bold ? `<strong>${escapeHtml(i.text)}</strong>` : escapeHtml(i.text))).join('');
}

/** Blocks → HTML string (static page). Text is always escaped; `headingShift` demotes headings. */
export function blocksToHtml(blocks: Block[], headingShift = 0): string {
  return blocks
    .map((b) => {
      if (b.type === 'heading') {
        const n = Math.min(6, b.level + headingShift);
        return `<h${n}>${inlineHtml(b.inline)}</h${n}>`;
      }
      if (b.type === 'list') return `<ul>${b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join('')}</ul>`;
      return `<p>${inlineHtml(b.inline)}</p>`;
    })
    .join('\n');
}

/** localStorage key: the newest notes version the player has opened. */
export const NEWS_SEEN_KEY = 'kq.news.seen';

type NoteStorage = Pick<Storage, 'getItem' | 'setItem'>;

function storageOr(s?: NoteStorage): NoteStorage | null {
  if (s) return s;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // blocked storage (private mode, sandboxed preview)
  }
}

/** The last seen version, or null (nothing seen, or storage unavailable). Never throws. */
export function readSeen(s?: NoteStorage): string | null {
  try {
    return storageOr(s)?.getItem(NEWS_SEEN_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Remember `version` as seen (never moves backwards). Never throws. */
export function markSeen(version: string, s?: NoteStorage): void {
  try {
    const st = storageOr(s);
    if (!st) return;
    const prev = st.getItem(NEWS_SEEN_KEY);
    if (prev && compareVersions(prev, version) >= 0) return;
    st.setItem(NEWS_SEEN_KEY, version);
  } catch {
    /* storage full or blocked: the badge just shows again next time */
  }
}
