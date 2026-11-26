import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ERAS } from '../../src/core/era';
import type { Issue, LoadedPack } from '../../src/content/validate';
import type { QuestFile } from '../../src/rpg/types';
import type { Action, StoryFile } from '../../src/systems/story/types';

export interface StoryInput { file: string; story: StoryFile }
export interface QuestInput { file: string; data: QuestFile }

/** Literal bus emissions plus the runtime dispatchers whose event name is an expression. */
export function runtimeEvents(root: string): Set<string> {
  const names = new Set([
    'animal:alert', 'animal:fled', 'animal:settled', 'animal:returned', // animals/runtime.ts
    'hub:enter', 'hub:leave', // story/index.ts chooses the event when crossing the home ring
  ]);
  const dir = join(root, 'src');
  for (const path of readdirSync(dir, { recursive: true }).map(String)) {
    if (!path.endsWith('.ts')) continue;
    const source = readFileSync(join(dir, path), 'utf8');
    for (const m of source.matchAll(/\.emit\(\s*['"]([\w:-]+)['"]/g)) names.add(m[1]);
  }
  return names;
}

export function visitStoryActions(input: StoryInput, inspect: (a: Action, file: string, where: string) => void) {
  function visit(list: Action[] | undefined, file: string, where: string) {
    for (const a of list ?? []) {
      if (a.do === 'choice') for (const o of a.options) visit(o.then, file, `${where}/${a.id}/${o.key ?? o.label}`);
      inspect(a, file, where);
    }
  }
  const { file, story } = input;
  visit(story.leave, file, `${story.chapter}/leave`);
  for (const r of story.on ?? []) visit(r.do, file, `${story.chapter}/${r.id}`);
  for (const b of story.beats) {
    const where = `${story.chapter}/${b.id}`;
    visit(b.enter, file, where + '/enter');
    visit(b.exit, file, where + '/exit');
    for (const r of b.on ?? []) visit(r.do, file, `${where}/${r.id}`);
  }
}

export function checkSayIds(stories: StoryInput[], packs: LoadedPack[]): Issue[] {
  const issues: Issue[] = [];
  const definitions = new Map<string, { file: string; where: string; texts: string }>();
  const dialogue = new Map<string, string>();
  function record(id: string, file: string, where: string, texts: string[]) {
    const signature = JSON.stringify(texts);
    const prev = definitions.get(id);
    if (!prev) definitions.set(id, { file, where, texts: signature });
    else if (prev.texts !== signature) issues.push({
      level: 'error', file, id: where,
      message: `say id '${id}' has different text in ${prev.file} [${prev.where}]`,
    });
  }
  for (const { file, pack } of packs) for (const line of pack.dialogue ?? []) {
    dialogue.set(line.id, line.text_de);
    record(line.id, file, line.id, ERAS.map(() => line.text_de));
  }
  for (const input of stories) visitStoryActions(input, (a, file, where) => {
    if (a.do !== 'say') return;
    const id = a.id ?? a.line;
    const base = a.text ?? (a.line && dialogue.get(a.line));
    if (id && (a.variants || base !== undefined)) {
      // Compare each era by effective text, independent of JSON property order.
      // Variants form an ordered sequence in every era.
      record(id, file, where, ERAS.flatMap(era => a.variants ?? [a.text_by_era?.[era] ?? base!]));
    }
  });
  return issues;
}
