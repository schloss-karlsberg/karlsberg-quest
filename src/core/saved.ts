/** Helpers for reading saved values (save slices may be old, sparse or corrupt). */

/**
 * Every value of a string union, as a runtime list. A value added to the union but missing from the
 * list fails the typecheck, so save validators built on the list cannot silently reject (or reset)
 * saves that contain the new value.
 *
 *   const LOOK_TIMES = allOf<LookTime>()(['day', 'dawn', 'dusk', 'night', 'tour']);
 */
export const allOf = <T extends string>() =>
  <const V extends readonly T[]>(
    values: V,
    ..._missing: [Exclude<T, V[number]>] extends [never] ? [] : [missing: Exclude<T, V[number]>]
  ): readonly T[] => values;

/** Narrow an unknown saved value to one of `values`. */
export const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

// Small readers for owner restore code: a corrupt or hand-edited slice falls back per field instead
// of throwing or putting NaN, strings or nulls where the system expects numbers and lists.

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A finite number, else the fallback. */
export const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');
const isNumberRecord = (value: unknown): value is Record<string, number> => isRecord(value) && Object.values(value).every(Number.isFinite);

/** The string entries of a saved list (a non-list reads as empty). A clean list is returned as is. */
export const stringList = (value: unknown): string[] =>
  isStringList(value) ? value : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/** The finite number entries of a saved record (a non-record reads as empty). A clean record is returned as is. */
export const numberRecord = (value: unknown): Record<string, number> =>
  isNumberRecord(value) ? value
    : isRecord(value) ? Object.fromEntries(Object.entries(value).filter((e): e is [string, number] => Number.isFinite(e[1]))) : {};
