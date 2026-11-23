import { boot } from './boot';
import { t } from './i18n';
import { BootLoader } from './ui/loader';

const loader = new BootLoader(document.getElementById('boot-loader')!);
boot(document.getElementById('app')!, loader).catch((err) => {
  loader.fail(t('loader.bootFailed'));
  console.error('[boot] failed', err);
});
