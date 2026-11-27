import type { SaveManager } from '../../../core/save';
import { t } from '../../../i18n';
import type { TitleAction } from '../../../ui/title';
import type { StorySlice } from '../engine';

/** Save slot with the state before the ending was chosen (bible 06-enden §7.3). */
export const ENDING_SLOT = 'ending';

/** The title can lay out the replay action as soon as it can read the save slots. */
export function endingTitleActions(save: SaveManager): TitleAction[] {
  if (!save.has(ENDING_SLOT)) return [];
  const story = save.peek('auto')?.systems.story as Partial<StorySlice> | undefined;
  if (!story?.ending) return [];
  return [{ label: t('ui.menu.ending_again'), testid: 'title-ending-again', run: () => save.load(ENDING_SLOT) }];
}
