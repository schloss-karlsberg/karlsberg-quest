/** Ausrüstung and Talente renderers. */
import { ITEMS } from '../../rpg/items';
import { BASE_STATS, MAX_LEVEL, TALENTS, type TalentBranch, charmSlots, talentBlock, weaponPower } from '../../rpg/stats';
import type { DerivedStats, ItemDef } from '../../rpg/types';
import { h, svg } from '../../ui/dom';
import { addPausePage, refreshPausePage } from '../../ui/pause-pages';
import { iconFor } from './icons';
import type { ProgressionCore } from './logic';

export interface PageApi {
  core: ProgressionCore;
  item(id: string): ItemDef | undefined;
  name(id: string): string;
  atHome(): boolean;
  quickKey(): string;
  /** Equipment or talents changed (save, HUD). */
  changed(reason: string): void;
}

const BRANCHES: { id: TalentBranch; name: string; sub: string }[] = [
  { id: 'stab', name: 'Stab', sub: 'Der Messstab' },
  { id: 'laterne', name: 'Laterne', sub: 'Das Bannlicht' },
  { id: 'feldbuch', name: 'Wissen', sub: 'Erkundung und Vorrat' },
];

const CONSUMABLES = ITEMS.filter((i) => i.kind === 'consumable').map((i) => i.id);

function effectText(def: ItemDef | undefined): string {
  const e = def?.effect;
  if (!e) return '';
  const out: string[] = [];
  if (e.heal) out.push(`heilt ${e.heal} Lebenskraft`);
  if (e.stamina) out.push(e.stamina >= 100 ? 'Atem sofort voll' : `+${e.stamina} Atem`);
  if (e.bann) out.push(`+${e.bann} Bannlicht`);
  if (e.oil) out.push('füllt die Laterne');
  if (e.burst) out.push(`geworfen: hält Geister im Umkreis von ${e.burst} m fest`);
  return out.join(' · ');
}

const pct = (v: number) => `${v >= 1 ? '+' : '−'}${Math.abs(Math.round((v - 1) * 100))} %`;

function statRows(s: DerivedStats): [string, string][] {
  return [
    ['Lebenskraft', String(Math.round(s.maxHp))],
    ['Atem', String(Math.round(s.maxStamina))],
    ['Hieb', `${s.damage.toFixed(1)} Schaden`],
    ['Wuchthieb', `× ${s.heavy.toFixed(2)}`],
    ['Bannlicht', `${s.bannCharges} Ladungen · ${Math.round(s.bannAngle)}° · ${s.bannRange.toFixed(0)} m`],
    ['Nachladen', `${s.bannRecharge.toFixed(1)} s je Ladung`],
    ['Erlittener Schaden', s.damageTaken === 1 ? '—' : pct(s.damageTaken)],
    ['Atemkosten', s.staminaCost === 1 ? '—' : pct(s.staminaCost)],
    ['Heilung', s.healing === 1 ? '—' : pct(s.healing)],
    ['Erfahrung', s.xp === 1 ? '—' : pct(s.xp)],
    ['Fundglück', s.loot ? `+${Math.round(s.loot * 100)} %` : '—'],
    ['Spürsinn', s.sense ? `${s.sense} m` : '—'],
  ];
}

function renderGear(el: HTMLElement, api: PageApi): void {
  const { core } = api;
  const sl = core.slice();
  const stats = core.stats();
  const inv = sl.inventory;
  const owned = (kind: ItemDef['kind']) => Object.keys(inv).filter((id) => (inv[id] ?? 0) > 0 && (api.item(id)?.kind ?? 'quest') === kind);
  const icon = (id: string) => h('span.kqp-g-icon', svg(iconFor(id, api.item(id))));

  // ---- weapon
  const wid = sl.equipped.weapon;
  const wdef = wid ? api.item(wid) : undefined;
  const others = owned('weapon').filter((id) => id !== wid).sort((a, b) => weaponPower(b) - weaponPower(a));
  const weapon = h('section.kqp-g-sec', [
    h('h3', 'Messstab'),
    wdef
      ? h('div.kqp-g-weapon', { 'data-testid': 'gear-weapon', dataset: { item: wid! } }, [
          icon(wid!),
          h('div', [
            h('div.kqp-g-name', wdef.name_de),
            h('div.kqp-g-meta', `Hieb ${wdef.effect?.damage ?? BASE_STATS.damage}${(wdef.effect?.spectral ?? 1) !== 1 ? ` · gegen Geister × ${wdef.effect!.spectral}` : ''}${wdef.effect?.sweep ? ' · Wuchthieb im Kreis' : ''}`),
            h('p.kqp-g-text', wdef.text_de),
          ]),
        ])
      : h('p.kqp-g-empty', 'Noch kein Stab. Marlene hat einen für dich.'),
    ...others.map((id) =>
      h('div.kqp-g-row', [
        icon(id),
        h('span.kqp-g-name', api.name(id)),
        h('button.kq-btn.kqp-g-btn', { 'data-testid': `gear-equip-${id}`, onclick: () => (core.equip(id), api.changed('equip')) }, 'Nehmen'),
      ]),
    ),
  ]);

  // ---- charms
  const slots = charmSlots(sl.level);
  const charmSlotsEl = h(
    'div.kqp-g-slots',
    Array.from({ length: 2 }, (_, i) => {
      const id = sl.equipped.charms[i];
      if (i >= slots) return h('div.kqp-g-slot.locked', [h('span.kqp-g-slotno', String(i + 1)), h('span', 'ab Stufe 6')]);
      if (!id) return h('div.kqp-g-slot.free', [h('span.kqp-g-slotno', String(i + 1)), h('span', 'frei')]);
      return h('div.kqp-g-slot.on', { dataset: { item: id } }, [
        h('span.kqp-g-slotno', String(i + 1)),
        icon(id),
        h('span.kqp-g-name', api.name(id)),
        h('button.kq-btn.kqp-g-btn', { 'data-testid': `gear-unequip-${id}`, onclick: () => (core.unequip(id), api.changed('equip')) }, 'Ablegen'),
      ]);
    }),
  );
  const loose = owned('charm').filter((id) => !sl.equipped.charms.includes(id));
  const charms = h('section.kqp-g-sec', [
    h('h3', ['Amulette ', h('span.kqp-g-small', slots === 1 ? '(1 Platz)' : '(2 Plätze)')]),
    charmSlotsEl,
    ...loose.map((id) =>
      h('div.kqp-g-row.kqp-g-charm', [
        icon(id),
        h('div.kqp-g-grow', [h('div.kqp-g-name', api.name(id)), h('p.kqp-g-text', api.item(id)?.text_de ?? '')]),
        h('button.kq-btn.kqp-g-btn', { 'data-testid': `gear-equip-${id}`, onclick: () => (core.equip(id), api.changed('equip')) }, 'Anlegen'),
      ]),
    ),
    !loose.length && !sl.equipped.charms.length ? h('p.kqp-g-empty', 'Noch keins. Die Leute hier geben dir eins, wenn du ihnen hilfst.') : null,
  ]);

  const statsEl = h('section.kqp-g-sec', [h('h3', 'Werte'), h('dl.kqp-g-stats', { 'data-testid': 'gear-stats' }, statRows(stats).flatMap(([k, v]) => [h('dt', k), h('dd', v)]))]);

  // ---- supplies
  const quick = core.quickItem();
  const supplies = h('section.kqp-g-sec', [
    h('h3', 'Vorräte'),
    ...CONSUMABLES.map((id) => {
      const def = api.item(id)!;
      const n = inv[id] ?? 0;
      const isQuick = quick === id;
      return h(`div.kqp-g-row.kqp-g-supply${n ? '' : '.none'}${isQuick ? '.quick' : ''}`, { 'data-testid': `gear-supply-${id}` }, [
        icon(id),
        h('div.kqp-g-grow', [h('div.kqp-g-name', [def.name_de, ' ', h('span.kqp-g-count', `${n} / ${def.stack ?? 9}`)]), h('div.kqp-g-meta', effectText(def))]),
        h(
          `button.kq-btn.kqp-g-btn${isQuick ? '.primary' : ''}`,
          { 'data-testid': `gear-quick-${id}`, 'aria-pressed': isQuick ? 'true' : 'false', title: 'Auf die Schnelltaste legen', onclick: () => (core.setQuick(id), api.changed('quick')) },
          isQuick ? `Auf ${api.quickKey()} ✓` : `Auf ${api.quickKey()}`,
        ),
        h('button.kq-btn.kqp-g-btn', { 'data-testid': `gear-use-${id}`, disabled: n < 1, onclick: () => (core.use(id), api.changed('use')) }, 'Benutzen'),
      ]);
    }),
  ]);

  // ---- quest items, keys, lore
  const quest = [...owned('quest'), ...owned('key')];
  const finds = h('section.kqp-g-sec', [
    h('h3', 'Fundstücke'),
    ...quest.map((id) =>
      h('div.kqp-g-row', { 'data-testid': `gear-quest-${id}` }, [
        icon(id),
        h('div.kqp-g-grow', [h('div.kqp-g-name', [api.name(id), (inv[id] ?? 0) > 1 ? h('span.kqp-g-count', ` ×${inv[id]}`) : null]), api.item(id)?.text_de ? h('p.kqp-g-text', api.item(id)!.text_de) : null]),
      ]),
    ),
    !quest.length ? h('p.kqp-g-empty', 'Nichts, was jemand vermisst. Noch nicht.') : null,
  ]);
  const lore = owned('lore');
  const writings = h('section.kqp-g-sec', [
    h('h3', 'Schriften'),
    ...lore.map((id) => {
      const def = api.item(id);
      const label = def?.fact && def.fiction === false ? `Quelle: Codex ${def.fact}` : 'Fiktion';
      return h('details.kqp-g-lore', { 'data-testid': `gear-lore-${id}` }, [h('summary', [icon(id), h('span.kqp-g-name', api.name(id)), h('span.kqp-g-label', label)]), h('p.kqp-g-text', def?.text_de ?? '')]);
    }),
    !lore.length ? h('p.kqp-g-empty', 'Lose Seiten, Marken, Zeichen: was du findest, kannst du hier lesen.') : null,
  ]);

  el.replaceChildren(h('div.kqp-gear', { 'data-testid': 'journal-gear' }, [h('div.kqp-g-col', [weapon, charms, statsEl]), h('div.kqp-g-col', [supplies, finds, writings])]));
}

function renderTalents(el: HTMLElement, api: PageApi): void {
  const { core } = api;
  const sl = core.slice();
  const home = api.atHome();
  const spent = Object.values(sl.talents).reduce((a, b) => a + b, 0);
  const head = h('div.kqp-t-head', [
    h('div.kqp-t-points', { 'data-testid': 'talent-points', dataset: { points: String(sl.points) } }, sl.points ? [h('span.kqp-t-big', String(sl.points)), sl.points === 1 ? ' Talentpunkt frei' : ' Talentpunkte frei'] : 'Alle Talentpunkte verteilt'),
    h('div.kqp-t-level', `Stufe ${sl.level}${sl.level >= MAX_LEVEL ? ' (Höchststufe)' : ''} · jede Stufe ein Punkt`),
    h('div.kqp-t-respec', [
      h('button.kq-btn', { 'data-testid': 'talent-respec', disabled: !home || spent === 0, onclick: () => (core.respec(), api.changed('respec')) }, 'Neu verteilen'),
      h('span.kqp-g-small', home ? ' An der Quelle: kostenlos.' : ' Nur an der Quelle.'),
    ]),
  ]);
  const cols = BRANCHES.map((b) =>
    h(`section.kqp-t-col.kqp-t-${b.id}`, [
      h('h3', [b.name, h('span.kqp-g-small', ` ${b.sub}`)]),
      ...TALENTS.filter((t) => t.branch === b.id).map((t) => {
        const rank = core.talentRank(t.id);
        const block = talentBlock(sl, t.id);
        const req = (t.requires ?? []).map((r) => TALENTS.find((x) => x.id === r)?.name_de ?? r);
        const state = rank >= t.maxRank ? 'max' : block === 'requires' ? 'locked' : rank > 0 ? 'some' : 'none';
        return h(`div.kqp-t-node.${state}`, { 'data-testid': `talent-${t.id}`, dataset: { rank: String(rank), max: String(t.maxRank) } }, [
          h('div.kqp-t-top', [
            h('span.kqp-t-name', t.name_de),
            h(
              'span.kqp-t-pips',
              { 'aria-label': `Rang ${rank} von ${t.maxRank}` },
              Array.from({ length: t.maxRank }, (_, i) => h(`span.kqp-t-pip${i < rank ? '.on' : ''}`, i < rank ? '◆' : '◇')),
            ),
          ]),
          h('p.kqp-t-text', t.text_de),
          req.length ? h('p.kqp-t-req', `braucht: ${req.join(', ')}`) : null,
          h(
            'button.kq-btn.kqp-g-btn',
            { 'data-testid': `talent-learn-${t.id}`, disabled: block !== null, onclick: () => (core.learn(t.id), api.changed('talent')) },
            rank >= t.maxRank ? 'Gelernt' : 'Lernen',
          ),
        ]);
      }),
    ]),
  );
  el.replaceChildren(h('div.kqp-talents', { 'data-testid': 'journal-talents' }, [head, h('div.kqp-t-cols', cols)]));
}

/** Register both pages and refresh either one when progression changes. */
export function installProgressionPages(api: PageApi): { refresh(): void } {
  addPausePage({ id: 'gear', label: 'Ausrüstung', order: 40, render: (el) => renderGear(el, api) });
  addPausePage({ id: 'talents', label: 'Talente', order: 50, render: (el) => renderTalents(el, api), badge: () => api.core.slice().points });
  return {
    refresh() {
      refreshPausePage('gear');
      refreshPausePage('talents');
    },
  };
}
