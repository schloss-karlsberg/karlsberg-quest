import { boot } from './boot';

boot(document.getElementById('app')!).catch((err) => {
  console.error('[boot] failed', err);
});
