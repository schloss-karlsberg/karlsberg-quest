import type { Source3D } from '../../audio/audio';
import { distantCourt, distantHooves, waterLoop } from '../../audio/ambience';
import { type Loop, chirp, drone, windLoop } from '../../audio/synth';
import type { GameContext } from '../../core/context';
import type { Era } from '../../core/era';
import { defineSystem } from '../../core/systems';
import { addStrings } from '../../i18n';
import { ambienceAt, PLATEAU } from './profile';

addStrings('de', {
  'ambience.wind': 'Wind rauscht.',
  'ambience.birds': 'Vögel zwitschern.',
  'ambience.pond': 'Wasser schwappt ans Ufer.',
  'ambience.brook': 'Ein Bach plätschert.',
  'ambience.hooves': 'In der Ferne klappern Hufe.',
  'ambience.court': 'Vom Schlosshof dringt leises Stimmengewirr herüber.',
});

class Ambience {
  private wind: Loop | null = null;
  private dread: Loop | null = null;
  private pond: Loop | null = null;
  private brook: Loop | null = null;
  private birds: Source3D | null = null;
  private court: Source3D | null = null;
  private birdTimer = 3;
  private courtTimer = 3;
  private hoovesNext = true;
  private courtNear = false;
  private water: 'pond' | 'brook' | null = null;
  private windCaption: (() => void) | null = null;
  private birdCaption: (() => void) | null = null;
  private waterCaption: (() => void) | null = null;
  private courtCaption: (() => void) | null = null;
  private era: Era | null = null;
  private elapsed = 0;

  constructor(private readonly ctx: GameContext) {}

  update(dt: number): void {
    const { audio, player, era, world } = this.ctx;
    this.elapsed += dt;
    // Control-rate updates keep the fades smooth without scheduling gain events at 60 Hz.
    const eraChanged = this.era !== era.current;
    if (this.elapsed < 0.2 && !eraChanged) return;
    const elapsed = this.elapsed;
    this.elapsed = 0;
    this.era = era.current;
    const p = player.position;
    const mix = ambienceAt(era.current, p.x, p.z);
    const hill = Math.max(0, Math.min(1, (p.y - 300) / 60));
    const agl = player.flying ? Math.max(0, p.y - world.heightAt(p.x, p.z)) : 0;
    const onGround = Math.max(0, 1 - agl / 30);
    const pond = mix.pond * onGround;
    const brook = mix.brook * onGround;
    if (this.ctx.settings.state.subtitles === false) {
      this.clearCaptions();
    } else {
      if (eraChanged || !this.windCaption) {
        this.windCaption?.();
        this.windCaption = this.caption('wind', 3200);
      }
      this.updateWaterCaption(pond, brook);
    }
    this.updateCourt(mix.court * onGround, elapsed);
    if (!player.flying && mix.birds > 0 && (this.birdTimer -= elapsed) <= 0) this.playBirds(mix.birds);

    if (!audio.unlocked) return;
    const bus = audio.bus('ambience');
    if (!bus) return;
    if (!this.wind) {
      this.wind = windLoop(audio, bus, 0);
      // The low dread bed is part of the score and follows the music slider.
      this.dread = drone(audio, audio.bus('music'), 49);
      this.pond = waterLoop(audio, bus, 'pond');
      this.brook = waterLoop(audio, bus, 'brook');
    }
    this.wind.setIntensity(Math.min(1, mix.wind + hill * 0.16 + Math.min(0.5, agl / 200)));
    this.dread?.setIntensity(mix.dread);
    this.pond?.setIntensity(pond);
    this.brook?.setIntensity(brook);
  }

  private caption(cue: string, ms: number, fiction = false): (() => void) | null {
    const { settings, t, ui } = this.ctx;
    return settings.state.subtitles !== false ? ui.hud.subtitle(null, t(`ambience.${cue}`), ms, fiction) : null;
  }

  private playBirds(level: number): void {
    this.birdTimer = (2.5 + Math.random() * 6) / level;
    this.birdCaption?.();
    this.birdCaption = this.caption('birds', 2000);
    const { audio, player } = this.ctx;
    if (!audio.unlocked) return;
    this.birds ??= audio.createSource3D('ambience', { refDistance: 8 });
    if (!this.birds) return;
    const { x, y, z } = player.position;
    const angle = Math.random() * Math.PI * 2;
    this.birds.setPosition(x + Math.cos(angle) * 25, y + 8, z + Math.sin(angle) * 25);
    chirp(audio, this.birds.input, { base: 2600 + Math.random() * 2200, count: 2 + Math.floor(Math.random() * 4), gain: 0.04 * level });
  }

  private updateWaterCaption(pond: number, brook: number): void {
    // Hysteresis keeps quiet boundary blends from repeatedly announcing the same bed.
    const water = pond >= (this.water === 'pond' ? 0.09 : 0.22) ? 'pond'
      : brook >= (this.water === 'brook' ? 0.09 : 0.22) ? 'brook' : null;
    if (water === this.water) return;
    this.waterCaption?.();
    this.water = water;
    this.waterCaption = water ? this.caption(water, 3200) : null;
  }

  private updateCourt(level: number, elapsed: number): void {
    const { audio, world } = this.ctx;
    const near = level >= (this.courtNear ? 0.10 : 0.28);
    this.courtNear = near;
    if (this.court && audio.ctx) this.court.input.gain.setTargetAtTime(level, audio.ctx.currentTime, 0.18);
    if (!near) {
      this.courtTimer = 3;
      this.hoovesNext = true;
      this.courtCaption?.();
      this.courtCaption = null;
      return;
    }
    this.courtTimer -= elapsed;
    if (this.courtTimer > 0) return;
    this.courtTimer = this.hoovesNext ? 9 : 15 + Math.random() * 7;
    this.courtCaption?.();
    this.courtCaption = this.caption(this.hoovesNext ? 'hooves' : 'court', 3500, true);
    if (audio.unlocked) {
      this.court ??= audio.createSource3D('ambience', { refDistance: 18, rolloff: 0.65 });
      if (this.court) {
        this.court.input.gain.value = level;
        const x = PLATEAU.x + (this.hoovesNext ? -24 : 27);
        const z = PLATEAU.z - (this.hoovesNext ? 42 : 53);
        this.court.setPosition(x, world.heightAt(x, z) + 1.5, z);
        const play = this.hoovesNext ? distantHooves : distantCourt;
        play(audio, this.court.input);
      }
    }
    this.hoovesNext = !this.hoovesNext;
  }

  private clearCaptions(): void {
    this.windCaption?.();
    this.birdCaption?.();
    this.waterCaption?.();
    this.courtCaption?.();
    this.windCaption = this.birdCaption = this.waterCaption = this.courtCaption = null;
    this.water = null;
  }

  dispose(): void {
    this.wind?.stop();
    this.dread?.stop();
    this.pond?.stop();
    this.brook?.stop();
    this.birds?.dispose();
    this.court?.dispose();
    this.clearCaptions();
  }
}

let ambience: Ambience | null = null;
export default defineSystem({
  id: 'ambience',
  init(ctx) { ambience = new Ambience(ctx); },
  update(dt) { ambience?.update(dt); },
  dispose() {
    ambience?.dispose();
    ambience = null;
  },
});
