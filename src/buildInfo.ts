/**
 * Version and build, injected at build time by `define` in vite.config.ts: the package.json
 * version and the short git SHA of HEAD ('dev' without git). Only these two literals are injected;
 * no environment variable reaches the bundle this way.
 */
declare const __KQ_VERSION__: string;
declare const __KQ_BUILD__: string;

export const KQ_VERSION: string = typeof __KQ_VERSION__ === 'string' ? __KQ_VERSION__ : '0.0.0';
export const KQ_BUILD: string = typeof __KQ_BUILD__ === 'string' ? __KQ_BUILD__ : 'dev';
