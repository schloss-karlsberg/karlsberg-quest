import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderNewsPage } from '../vite.config';
import {
  NEWS_SEEN_KEY,
  blocksToHtml,
  collectNotes,
  compareVersions,
  hasUnseen,
  markSeen,
  parseInline,
  parseMarkdown,
  readSeen,
  versionFromPath,
} from '../src/ui/releaseNotes';

class FakeStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}
const throwing = {
  getItem(): string | null {
    throw new Error('blocked');
  },
  setItem(): void {
    throw new Error('blocked');
  },
};

describe('release notes: versions', () => {
  it('reads the version from a notes path', () => {
    expect(versionFromPath('/content/release-notes/v0.5.0.md')).toBe('0.5.0');
    expect(versionFromPath('v1.12.3.md')).toBe('1.12.3');
    expect(versionFromPath('/content/release-notes/README.md')).toBeNull();
    expect(versionFromPath('/content/release-notes/v0.5.md')).toBeNull();
  });

  it('compares numerically, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.5.0', 'v0.5.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('2.0', '2.0.0')).toBe(0);
  });

  it('sorts notes newest first and skips files without a version', () => {
    const notes = collectNotes({ '/x/v0.5.0.md': 'a', '/x/v0.10.0.md': 'c', '/x/v0.6.1.md': 'b', '/x/notes.md': 'z' });
    expect(notes.map((n) => n.version)).toEqual(['0.10.0', '0.6.1', '0.5.0']);
  });
});

describe('release notes: unseen badge', () => {
  it('shows when nothing was seen or a newer version exists', () => {
    expect(hasUnseen('0.5.0', null)).toBe(true);
    expect(hasUnseen('0.6.0', '0.5.0')).toBe(true);
    expect(hasUnseen('0.5.0', '0.5.0')).toBe(false);
    expect(hasUnseen('0.5.0', '0.6.0')).toBe(false);
    expect(hasUnseen(null, null)).toBe(false);
  });

  it('remembers the newest seen version and never moves backwards', () => {
    const s = new FakeStorage();
    expect(readSeen(s)).toBeNull();
    markSeen('0.6.0', s);
    expect(s.map.get(NEWS_SEEN_KEY)).toBe('0.6.0');
    markSeen('0.5.0', s);
    expect(readSeen(s)).toBe('0.6.0');
    expect(hasUnseen('0.6.0', readSeen(s))).toBe(false);
  });

  it('never throws when storage is blocked', () => {
    expect(readSeen(throwing)).toBeNull();
    expect(() => markSeen('0.5.0', throwing)).not.toThrow();
  });
});

describe('release notes: markdown subset', () => {
  it('parses headings, lists, paragraphs and bold', () => {
    const blocks = parseMarkdown('# Titel\n\nErster Satz\nzweite Zeile.\n\n## Neu\n\n- **Fett:** Text\n- zweiter Punkt\n  weiter\n\nSchluss');
    expect(blocks).toEqual([
      { type: 'heading', level: 1, inline: [{ bold: false, text: 'Titel' }] },
      { type: 'paragraph', inline: [{ bold: false, text: 'Erster Satz zweite Zeile.' }] },
      { type: 'heading', level: 2, inline: [{ bold: false, text: 'Neu' }] },
      {
        type: 'list',
        items: [
          [{ bold: true, text: 'Fett:' }, { bold: false, text: ' Text' }],
          [{ bold: false, text: 'zweiter Punkt' }, { bold: false, text: ' ' }, { bold: false, text: 'weiter' }],
        ],
      },
      { type: 'paragraph', inline: [{ bold: false, text: 'Schluss' }] },
    ]);
  });

  it('keeps an unmatched ** literal', () => {
    expect(parseInline('a ** b')).toEqual([{ bold: false, text: 'a ** b' }]);
  });

  it('escapes HTML instead of passing it through', () => {
    const html = blocksToHtml(parseMarkdown('# <script>alert(1)</script>\n\n- **<b>x</b>** & "y"\n\n<img src=x onerror=alert(1)>'));
    expect(html).not.toMatch(/<script|<img|<b>/);
    expect(html).toContain('<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>');
    expect(html).toContain('<li><strong>&lt;b&gt;x&lt;/b&gt;</strong> &amp; &quot;y&quot;</li>');
    expect(html).toContain('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('demotes headings for the static page', () => {
    expect(blocksToHtml(parseMarkdown('# A\n\n## B'), 1)).toBe('<h2>A</h2>\n<h3>B</h3>');
  });
});

describe('release notes: content', () => {
  const dir = 'content/release-notes';
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));

  it('uses the German revision label in the public news footer', () => {
    expect(renderNewsPage()).toMatch(/<footer>Aktuelle Version \d+\.\d+\.\d+ · Stand \S+ · <a href="\.\/">Zurück zum Spiel<\/a><\/footer>/);
  });

  it('every file is named vX.Y.Z.md and has the three player sections', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(versionFromPath(f), f).not.toBeNull();
      const md = readFileSync(`${dir}/${f}`, 'utf8');
      const heads = parseMarkdown(md).filter((b) => b.type === 'heading').map((b) => b.inline.map((i) => i.text).join(''));
      expect(heads, f).toEqual(expect.arrayContaining(['Neu', 'Besser', 'Behoben']));
    }
  });
});
