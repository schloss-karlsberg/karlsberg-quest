/** Body stances. Lower stances are slower, quieter and harder to see. */
export type Stance = 'stand' | 'crouch' | 'prone';

export interface StanceParams {
  /** Eye height above the ground (m). */
  eye: number;
  /** Walking speed (m/s). */
  speed: number;
  /** Sprint speed (m/s); only standing. */
  sprint: number;
  /** Base noise of moving in this stance (0..1). */
  noise: number;
  /** How visible the body is (0..1) before light/cover modifiers. */
  visibility: number;
  /** Stride length (m) between footstep events. */
  stride: number;
}

export const STANCES: Record<Stance, StanceParams> = {
  stand: { eye: 1.65, speed: 3.2, sprint: 6.2, noise: 0.45, visibility: 1, stride: 0.8 },
  crouch: { eye: 1.05, speed: 1.6, sprint: 1.6, noise: 0.18, visibility: 0.55, stride: 0.55 },
  prone: { eye: 0.38, speed: 0.6, sprint: 0.6, noise: 0.06, visibility: 0.22, stride: 0.45 },
};
