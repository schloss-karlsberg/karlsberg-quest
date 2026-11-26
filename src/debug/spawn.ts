function finiteParam(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key)?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** Local starting position from a shared URL. The yaw parameter is in degrees. */
export function spawnFromParams(params: URLSearchParams): { x: number; z: number; yaw?: number } | null {
  const x = finiteParam(params, 'x');
  const z = finiteParam(params, 'z');
  if (x === undefined || z === undefined) return null;
  const degrees = finiteParam(params, 'yaw');
  return { x, z, yaw: degrees === undefined ? undefined : degrees * (Math.PI / 180) };
}
