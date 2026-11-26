/**
 * The Fläschchen's German UI text. The bottles are only ever called „Fläschchen“; the label on the
 * glass lives in content/collectibles/flaschen.json and nowhere else (never in a string here).
 */
import type { Era } from '../../core/era';

const ERA_DE: Record<Era, string> = { today: 'heute', '1789': '1789', '1793-02': 'Feb. 1793', '1793-07': 'Juli 1793', '1796': '1796' };

export const FLASCHEN_DE = {
  name: 'Fläschchen',
  prompt: 'Fläschchen aufheben',
  toast: (n: number, total: number) => `Fläschchen ${n}/${total}`,
  card: 'Ein Fläschchen im Laub. Mitnehmen: Der Wald ist kein Keller.',
  /** Pause → Sammlungen: the era counts. */
  row: (n: number, total: number, eras: { era: Era; found: number; total: number }[]) =>
    `Fläschchen ${n}/${total} · ${eras.map((e) => `${ERA_DE[e.era]} ${e.found}/${e.total}`).join(' · ')}`,
  rowNote: 'Treibgut aus allen Jahren, an Orten, wo jemand gern war. Kein Zeichen auf der Karte.',
  /** Caption of the clink; side = links / rechts / vorn / hinten. */
  clink: (side: string) => `[Glas klirrt leise, ${side}]`,
  side: { left: 'links', right: 'rechts', front: 'vorn', back: 'hinten' },
  marlene: 'Du sammelst Flaschen im Wald? Gut. Einer muss es ja machen.',
  laub: 'Die Quelle erinnert sich, wo Menschen froh waren. Dort spült sie die Fläschchen hin, in jedes Jahr, auch in die falschen.',
  all: 'Alle Fläschchen gefunden. Laub hat Ihnen ein Laternenglas geschliffen: „Flaschengrün“.',
  laub1789: 'Das gehört nicht in dieses Jahr.',
} as const;
