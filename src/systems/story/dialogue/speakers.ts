/**
 * Speaker presentation: display name, procedural portrait kind, voice timbre and label.
 * ContentDB speakers (content packs) override the display name and the historical flag; unknown
 * ids fall back to a neutral cameo. Ids may be namespaced ("sp.laub" → "laub").
 */
import type { ContentDB } from '../../../content/db';
import { t } from '../../../i18n';

export type PortraitKind = 'compass' | 'radio' | 'ledger' | 'widow' | 'boy' | 'hunter' | 'carter' | 'wig' | 'servant' | 'device' | 'cameo';

export interface VoiceSpec {
  /** Base pitch (Hz). */
  base: number;
  /** Random pitch spread (fraction). */
  spread: number;
  wave: OscillatorType;
  /** Formant centre (Hz) and Q. */
  formant: number;
  q: number;
  gain: number;
  /** Band-limited radio voice with crackle. */
  radio?: boolean;
  /** Brass ring partial (the compass). */
  ring?: boolean;
  /** Distant hall (echoes / memories). */
  hall?: boolean;
  /** Optional live source bound by the world. */
  emitter?: string;
}

export interface SpeakerMeta {
  id: string;
  name: string;
  portrait: PortraitKind;
  /** Historical person (words from sources only). */
  historical: boolean;
  /** Voice from a memory: labelled "Erinnerung (Fiktion)". */
  echo: boolean;
  voice: VoiceSpec;
}

const V = (base: number, formant: number, wave: OscillatorType = 'triangle', extra: Partial<VoiceSpec> = {}): VoiceSpec => ({
  base,
  spread: 0.18,
  wave,
  formant,
  q: 4,
  gain: 0.05,
  ...extra,
});

const BUILTIN: Record<string, Omit<SpeakerMeta, 'id'>> = {
  imhoff: { name: 'Gerold Imhoff', portrait: 'cameo', historical: false, echo: false, voice: V(160, 1000, 'triangle', { emitter: 'imhoff' }) },
  laub: { name: 'Quirin Laub', portrait: 'compass', historical: false, echo: false, voice: V(150, 1250, 'sawtooth', { ring: true, q: 7, gain: 0.035 }) },
  marlene: { name: 'Marlene · Funk', portrait: 'radio', historical: false, echo: false, voice: V(215, 1050, 'triangle', { radio: true, gain: 0.06 }) },
  kollege: { name: 'Ein Kollege · Funk', portrait: 'radio', historical: false, echo: false, voice: V(120, 800, 'triangle', { radio: true, gain: 0.05 }) },
  laptop: { name: 'Laptop', portrait: 'device', historical: false, echo: false, voice: V(880, 2200, 'square', { spread: 0.02, gain: 0.018, q: 2 }) },
  soll: { name: 'Kanzlist Gottlob Soll', portrait: 'ledger', historical: false, echo: true, voice: V(200, 1500, 'triangle', { spread: 0.3, hall: true }) },
  hanne: { name: 'Hanne', portrait: 'widow', historical: false, echo: true, voice: V(230, 950, 'triangle', { spread: 0.12, hall: true }) },
  jost: { name: 'Jost', portrait: 'boy', historical: false, echo: true, voice: V(290, 1400, 'triangle', { spread: 0.25, hall: true }) },
  jost_alt: { name: 'Der Pikeur', portrait: 'hunter', historical: false, echo: true, voice: V(110, 700, 'sawtooth', { spread: 0.1, hall: true, gain: 0.035 }) },
  pikeur: { name: 'Der Pikeur', portrait: 'hunter', historical: false, echo: true, voice: V(110, 700, 'sawtooth', { spread: 0.1, hall: true, gain: 0.035 }) },
  peter: { name: 'Peter', portrait: 'carter', historical: false, echo: true, voice: V(175, 900, 'triangle', { spread: 0.1, hall: true }) },
  diener: { name: 'Ein Diener', portrait: 'servant', historical: false, echo: true, voice: V(170, 1100, 'triangle', { hall: true }) },
  gaertner: { name: 'Ein Gärtner', portrait: 'servant', historical: false, echo: true, voice: V(140, 800, 'triangle', { hall: true }) },
  gaertner2: { name: 'Zweiter Gärtner', portrait: 'servant', historical: false, echo: true, voice: V(160, 900, 'triangle', { hall: true }) },
  mannlich: { name: 'Johann Christian von Mannlich', portrait: 'wig', historical: true, echo: true, voice: V(125, 850, 'triangle', { spread: 0.1, hall: true }) },
  herzog: { name: 'Herzog Karl II. August', portrait: 'wig', historical: true, echo: true, voice: V(105, 650, 'sawtooth', { spread: 0.08, hall: true, gain: 0.03 }) },
};

export function speakerKey(id: string): string {
  const s = id.toLowerCase();
  if (BUILTIN[s]) return s;
  const tail = s.split('.').pop() ?? s;
  return BUILTIN[tail] ? tail : s;
}

export function speakerMeta(id: string, content?: ContentDB): SpeakerMeta {
  const key = speakerKey(id);
  const b = BUILTIN[key];
  const c = content?.speakers.get(id);
  if (b) return { id: key, ...b, name: c?.name_de ?? b.name, historical: c?.historical ?? b.historical };
  return {
    id,
    name: c?.name_de ?? t('common.unknownPerson'),
    portrait: c?.historical ? 'wig' : 'cameo',
    historical: c?.historical ?? false,
    echo: c?.historical ?? false,
    voice: V(160, 1000, 'triangle', { hall: !!c?.historical }),
  };
}
