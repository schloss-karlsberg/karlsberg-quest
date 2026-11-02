/** The eras the land remembers. 'today' = 2025 LiDAR terrain; all others use the 1789 terrain. */
export const ERAS = ['today', '1789', '1793-02', '1793-07', '1796'] as const;
export type Era = (typeof ERAS)[number];

export interface EraInfo {
  id: Era;
  /** i18n key of the era's display name. */
  labelKey: string;
  /** Which height dataset the world uses. */
  terrain: '2025' | '1789';
  /** How the 1789 palace model is shown. */
  palace: 'hidden' | 'intact' | 'ruin';
  /** Spirit view (free flight) allowed. */
  spiritView: boolean;
  /** Night era (hunt eras, lantern matters). */
  night: boolean;
}

export const ERA_INFO: Record<Era, EraInfo> = {
  today: { id: 'today', labelKey: 'era.today', terrain: '2025', palace: 'hidden', spiritView: true, night: false },
  '1789': { id: '1789', labelKey: 'era.1789', terrain: '1789', palace: 'intact', spiritView: false, night: false },
  '1793-02': { id: '1793-02', labelKey: 'era.1793-02', terrain: '1789', palace: 'intact', spiritView: false, night: true },
  '1793-07': { id: '1793-07', labelKey: 'era.1793-07', terrain: '1789', palace: 'intact', spiritView: false, night: true },
  '1796': { id: '1796', labelKey: 'era.1796', terrain: '1789', palace: 'ruin', spiritView: false, night: false },
};

export function isEra(v: unknown): v is Era {
  return typeof v === 'string' && (ERAS as readonly string[]).includes(v);
}
