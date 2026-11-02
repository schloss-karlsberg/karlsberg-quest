/**
 * Procedural etching-style portraits (inline SVG, no image files): hatching patterns, a turbulence
 * displacement for the wobbly copper-plate line, per-speaker motifs. Laub is a brass surveyor's
 * compass with a face in the dial; Marlene is a field radio; figures of the past are hatched
 * silhouettes in oval cameos (historical persons in an ornate frame).
 */
import type { PortraitKind } from './speakers';

const INK = '#2a2118';
let defsInstalled = false;

/** Shared <defs> (patterns, filters) – installed once into the document. */
export function ensurePortraitDefs(): void {
  if (defsInstalled || typeof document === 'undefined') return;
  defsInstalled = true;
  const wrap = document.createElement('div');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  wrap.innerHTML = `<svg width="0" height="0"><defs>
    <pattern id="kqs-h1" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" stroke="${INK}" stroke-width="0.7"/></pattern>
    <pattern id="kqs-h2" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)"><path d="M0 0V3M0 0H3" stroke="${INK}" stroke-width="0.6"/></pattern>
    <pattern id="kqs-h3" patternUnits="userSpaceOnUse" width="2" height="2" patternTransform="rotate(-35)"><line x1="0" y1="0" x2="0" y2="2" stroke="${INK}" stroke-width="0.8"/></pattern>
    <pattern id="kqs-hv" patternUnits="userSpaceOnUse" width="2.6" height="4"><line x1="0" y1="0" x2="0" y2="4" stroke="${INK}" stroke-width="0.45"/></pattern>
    <pattern id="kqs-hb" patternUnits="userSpaceOnUse" width="2.4" height="2.4" patternTransform="rotate(30)"><line x1="0" y1="0" x2="0" y2="2.4" stroke="#6d4f1c" stroke-width="0.6"/></pattern>
    <radialGradient id="kqs-brass" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#f3dc9a"/><stop offset="0.55" stop-color="#c39a4a"/><stop offset="1" stop-color="#6a4a18"/></radialGradient>
    <radialGradient id="kqs-dial" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#f5ecd4"/><stop offset="1" stop-color="#d9c79f"/></radialGradient>
    <radialGradient id="kqs-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <clipPath id="kqs-oval"><ellipse cx="60" cy="62" rx="46" ry="52"/></clipPath>
    <filter id="kqs-etch" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/></filter>
  </defs></svg>`;
  document.body.append(wrap);
}

const ticks = (cx: number, cy: number, r0: number, r1: number, n: number, every: number, r2: number): string => {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = i % every === 0 ? r2 : r0;
    s += `M${(cx + Math.sin(a) * r).toFixed(1)} ${(cy - Math.cos(a) * r).toFixed(1)}L${(cx + Math.sin(a) * r1).toFixed(1)} ${(cy - Math.cos(a) * r1).toFixed(1)}`;
  }
  return s;
};

/** Head-and-shoulders profile facing right (used by the cameo figures). */
const PROFILE =
  'M30 120C30 100 38 92 50 88C44 82 41 73 42 63C43 47 55 36 69 37C81 38 89 48 88 60C88 63 91 66 93 69C94 71 92 72 90 72C90 76 89 79 87 80C88 82 87 84 85 84C84 88 81 90 75 90C75 93 76 96 79 98C91 101 99 109 101 120Z';

const COMPASS = `
<g filter="url(#kqs-etch)">
  <circle cx="60" cy="9" r="6" fill="none" stroke="${INK}" stroke-width="2"/>
  <rect x="54" y="13" width="12" height="7" rx="1.5" fill="url(#kqs-brass)" stroke="${INK}" stroke-width="1.2"/>
  <circle cx="60" cy="66" r="50" fill="url(#kqs-brass)" stroke="${INK}" stroke-width="2.2"/>
  <path d="M100 52A50 50 0 0 1 32 108A46 46 0 0 0 100 52Z" fill="url(#kqs-h2)" opacity="0.8"/>
  <circle cx="60" cy="66" r="50" fill="url(#kqs-hb)" opacity="0.55"/>
  <circle cx="60" cy="66" r="43" fill="url(#kqs-dial)" stroke="${INK}" stroke-width="1.5"/>
  <path d="${ticks(60, 66, 39.5, 43, 72, 6, 36.5)}" stroke="${INK}" stroke-width="0.7"/>
  <g font-family="IM Fell English SC, Georgia, serif" font-size="8" fill="${INK}" text-anchor="middle">
    <text x="60" y="34">N</text><text x="91" y="69">O</text><text x="60" y="104">S</text><text x="29" y="69">W</text>
  </g>
  <circle cx="60" cy="66" r="31" fill="none" stroke="${INK}" stroke-width="0.5" stroke-dasharray="1 1.6"/>
  <g class="kqs-face" fill="none" stroke="${INK}" stroke-linecap="round" opacity="0.88">
    <path d="M44 53C48 50 52 50 55 52M65 52C68 50 72 50 76 53" stroke-width="1.6"/>
    <circle cx="50" cy="59.5" r="6" stroke-width="1"/><circle cx="70" cy="59.5" r="6" stroke-width="1"/>
    <path d="M56 59Q60 57 64 59M44 59L38 57" stroke-width="0.9"/>
    <path class="kqs-eye" d="M47 60Q50 62 53 60M67 60Q70 62 73 60" stroke-width="1.4"/>
    <path d="M60 61L58.5 71L61 71.5" stroke-width="1"/>
    <path d="M49 77C53 73 57 74 60 75.5C63 74 67 73 71 77C67 76 64 77.5 60 77.5C56 77.5 53 76 49 77Z" fill="${INK}" stroke-width="0.6"/>
    <ellipse class="kqs-mouth" cx="60" cy="81" rx="4" ry="0.9" fill="${INK}" stroke="none"/>
    <path d="M51 86Q60 90 69 86" stroke-width="0.6" stroke-dasharray="1 1.2"/>
  </g>
  <g class="kqs-needle" style="transform-origin:60px 66px">
    <path d="M60 30L64 66L60 70L56 66Z" fill="#8c2f1f" opacity="0.62" stroke="${INK}" stroke-width="0.6"/>
    <path d="M60 102L63.5 66L60 62L56.5 66Z" fill="url(#kqs-h3)" opacity="0.55" stroke="${INK}" stroke-width="0.6"/>
  </g>
  <circle cx="60" cy="66" r="3" fill="url(#kqs-brass)" stroke="${INK}" stroke-width="0.8"/>
  <path d="M30 50A34 34 0 0 1 58 28" stroke="#fff8e6" stroke-width="3" fill="none" opacity="0.45" stroke-linecap="round"/>
</g>`;

const RADIO = `
<g filter="url(#kqs-etch)">
  <rect x="73" y="4" width="7" height="34" rx="3" fill="#cdbd98" stroke="${INK}" stroke-width="1.4"/>
  <rect x="73" y="4" width="7" height="34" rx="3" fill="url(#kqs-h3)" opacity="0.45"/>
  <rect x="40" y="22" width="11" height="10" rx="2" fill="#cdbd98" stroke="${INK}" stroke-width="1.2"/>
  <rect x="26" y="50" width="6" height="26" rx="2" fill="#bba982" stroke="${INK}" stroke-width="1.2"/>
  <rect x="30" y="30" width="60" height="86" rx="11" fill="#d9caa6" stroke="${INK}" stroke-width="2.2"/>
  <path d="M78 31Q90 31 90 44V104Q90 116 78 116H70Q82 112 82 98V46Q82 34 72 31Z" fill="url(#kqs-h2)" opacity="0.75"/>
  <rect x="38" y="39" width="40" height="17" rx="2" fill="#c3cba6" stroke="${INK}" stroke-width="1.2"/>
  <text x="43" y="50.5" font-family="ui-monospace, monospace" font-size="6.5" fill="${INK}">K-BERG 2</text>
  <polyline class="kqs-wave" points="40,53 44,53 47,51 50,55 53,50 56,54 59,52 62,53 66,51 70,54 76,53" fill="none" stroke="${INK}" stroke-width="0.8" opacity="0"/>
  <circle class="kqs-led" cx="84" cy="38" r="3" fill="#5b1a10" stroke="${INK}" stroke-width="0.8"/>
  <g fill="${INK}">${Array.from({ length: 36 }, (_, i) => `<circle cx="${43 + (i % 6) * 6.2}" cy="${66 + Math.floor(i / 6) * 7}" r="1.5"/>`).join('')}</g>
  <path d="M36 110H76" stroke="${INK}" stroke-width="0.6" stroke-dasharray="2 1.5"/>
</g>`;

const LEDGER = `
<g filter="url(#kqs-etch)">
  <path d="M8 86L58 70L112 84L62 104Z" fill="#e9dcbc" stroke="${INK}" stroke-width="1.6"/>
  <path d="M58 70L62 104" stroke="${INK}" stroke-width="1.2"/>
  <path d="M8 86L8 92L62 110L112 90L112 84L62 104Z" fill="url(#kqs-h1)" stroke="${INK}" stroke-width="1"/>
  <path d="M18 85L52 75M20 89L54 79M22 93L56 83M70 77L104 86M68 81L102 90M66 85L100 94" stroke="${INK}" stroke-width="0.6"/>
  <path d="M30 80L34 92M86 81L82 94" stroke="#8c2f1f" stroke-width="0.6"/>
  <path d="M74 66C82 40 98 20 112 8C104 26 94 46 78 68Z" fill="#efe6d0" stroke="${INK}" stroke-width="1.2"/>
  <path d="M76 66L110 10M80 58L88 52M82 52L92 44M86 46L96 36M90 38L100 28" stroke="${INK}" stroke-width="0.6"/>
  <g fill="none" stroke="${INK}" stroke-width="1.3"><circle cx="36" cy="60" r="8"/><circle cx="54" cy="58" r="8"/><path d="M44 59Q45 56 46 58M28 58L18 52"/></g>
</g>`;

function cameo(inner: string, opts: { ornate?: boolean; echo?: boolean } = {}): string {
  const frame = opts.ornate
    ? `<ellipse cx="60" cy="62" rx="50" ry="56" fill="none" stroke="${INK}" stroke-width="3"/>
       <ellipse cx="60" cy="62" rx="45" ry="51" fill="none" stroke="${INK}" stroke-width="0.8"/>
       <g fill="${INK}">${Array.from({ length: 28 }, (_, i) => {
         const a = (i / 28) * Math.PI * 2;
         return `<circle cx="${(60 + Math.cos(a) * 47.5).toFixed(1)}" cy="${(62 + Math.sin(a) * 53.5).toFixed(1)}" r="1.1"/>`;
       }).join('')}</g>`
    : `<ellipse cx="60" cy="62" rx="48" ry="54" fill="none" stroke="${INK}" stroke-width="2"/>`;
  return `<g filter="url(#kqs-etch)">
    <ellipse cx="60" cy="62" rx="47" ry="53" fill="#e6d8b6"/>
    <g clip-path="url(#kqs-oval)">
      <rect x="0" y="0" width="120" height="120" fill="url(#kqs-hv)" opacity="${opts.echo ? 0.35 : 0.6}"/>
      <g opacity="${opts.echo ? 0.72 : 1}" ${opts.echo ? 'stroke-dasharray="3 2"' : ''}>${inner}</g>
    </g>
    ${frame}
  </g>`;
}

const fig = (extra: string, fill = 'url(#kqs-h2)') =>
  `<path d="${PROFILE}" fill="#e6d8b6"/><path d="${PROFILE}" fill="${fill}" stroke="${INK}" stroke-width="1.6"/>${extra}`;

const WIDOW = fig(
  `<path d="M40 70C36 46 50 30 70 31C86 32 95 44 92 58C88 50 80 44 70 44C58 44 50 52 50 64C50 76 54 84 58 90C48 88 42 80 40 70Z" fill="url(#kqs-h1)" stroke="${INK}" stroke-width="1.4"/>
   <path d="M42 76C38 84 36 92 40 98" fill="none" stroke="${INK}" stroke-width="1.2"/>`,
);
const BOY = fig(
  `<path d="M44 50C46 38 58 32 72 34C84 36 92 44 93 50C100 50 106 52 108 55C96 56 70 55 44 54Z" fill="${INK}" opacity="0.85"/>
   <path d="M8 120C10 104 16 96 26 94C24 88 26 82 30 80L34 88C38 86 42 88 44 92C42 100 38 108 36 120Z" fill="url(#kqs-h3)" stroke="${INK}" stroke-width="1.3"/>
   <path d="M26 80L22 70L30 77Z" fill="${INK}"/>`,
  'url(#kqs-h1)',
);
const HUNTER = fig(
  `<path d="M34 50L48 34L74 30L98 38L104 48L84 46L60 46Z" fill="${INK}"/>
   <path d="M44 56C56 52 80 52 90 58L90 72C80 76 58 76 46 70Z" fill="${INK}" opacity="0.75"/>
   <circle cx="64" cy="104" r="15" fill="none" stroke="#7a5a22" stroke-width="3.2"/>
   <circle cx="64" cy="104" r="15" fill="none" stroke="${INK}" stroke-width="0.8"/>
   <path d="M78 98L96 88L100 94Z" fill="url(#kqs-brass)" stroke="${INK}" stroke-width="0.8"/>`,
  'url(#kqs-h2)',
);
const CARTER = fig(
  `<path d="M42 52C44 40 56 33 70 34C84 35 92 44 92 52L106 56C90 58 64 58 42 56Z" fill="url(#kqs-h3)" stroke="${INK}" stroke-width="1.3"/>`,
  'url(#kqs-h1)',
);
const SERVANT = fig(
  `<path d="M36 48L50 36L74 33L96 40L100 48L80 46L58 47Z" fill="url(#kqs-h3)" stroke="${INK}" stroke-width="1.2"/>
   <path d="M40 60C36 66 36 76 40 82" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
  'url(#kqs-h1)',
);
const WIG = fig(
  `<path d="M40 70C34 52 42 34 62 32C78 30 90 40 90 50C82 44 70 44 62 50C56 56 56 66 58 76C54 84 46 86 40 70Z" fill="#efe6d0" stroke="${INK}" stroke-width="1.2"/>
   <path d="M44 48C48 46 52 46 56 48M42 56C46 54 50 54 54 56M42 64C46 62 50 62 54 64" fill="none" stroke="${INK}" stroke-width="0.9"/>
   <path d="M38 76C32 80 30 86 32 90" fill="none" stroke="${INK}" stroke-width="1.6"/>
   <path d="M72 98C70 104 72 110 78 112C84 110 86 104 84 98Z" fill="#efe6d0" stroke="${INK}" stroke-width="1"/>`,
  'url(#kqs-h2)',
);
const CAMEO = fig('', 'url(#kqs-h1)');

const DEVICE = `
<g filter="url(#kqs-etch)">
  <path d="M22 24H98V82H22Z" fill="#1d1a16" stroke="${INK}" stroke-width="2"/>
  <path d="M26 28H94V78H26Z" fill="#25302c"/>
  <g fill="#cfe3c8" opacity="0.85">${Array.from({ length: 70 }, (_, i) => {
    const x = 28 + ((i * 37) % 64);
    const y = 30 + ((i * 53) % 46);
    return `<circle cx="${x}" cy="${y}" r="0.6"/>`;
  }).join('')}</g>
  <g class="kqs-paws" fill="#ffcf7a">${[0, 1, 2, 3, 4, 5].map((i) => `<g transform="translate(${34 + i * 9} ${70 - i * 6.5})"><ellipse cx="0" cy="0" rx="1.6" ry="2"/><circle cx="-1.8" cy="-2.8" r="0.7"/><circle cx="0" cy="-3.3" r="0.7"/><circle cx="1.8" cy="-2.8" r="0.7"/></g>`).join('')}</g>
  <path d="M10 82H110L102 96H18Z" fill="#cdbd98" stroke="${INK}" stroke-width="1.6"/>
  <path d="M10 82H110L102 96H18Z" fill="url(#kqs-h1)" opacity="0.5"/>
</g>`;

export function portraitSvg(kind: PortraitKind): string {
  let body: string;
  switch (kind) {
    case 'compass':
      body = COMPASS;
      break;
    case 'radio':
      body = RADIO;
      break;
    case 'ledger':
      body = LEDGER;
      break;
    case 'device':
      body = DEVICE;
      break;
    case 'widow':
      body = cameo(WIDOW, { echo: true });
      break;
    case 'boy':
      body = cameo(BOY, { echo: true });
      break;
    case 'hunter':
      body = cameo(HUNTER, { echo: true });
      break;
    case 'carter':
      body = cameo(CARTER, { echo: true });
      break;
    case 'servant':
      body = cameo(SERVANT, { echo: true });
      break;
    case 'wig':
      body = cameo(WIG, { ornate: true });
      break;
    default:
      body = cameo(CAMEO);
  }
  return `<svg class="kqs-portrait-svg kqs-p-${kind}" viewBox="0 0 120 120" aria-hidden="true">${body}</svg>`;
}
