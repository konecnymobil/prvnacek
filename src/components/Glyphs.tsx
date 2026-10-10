import { formText, type AppScriptSettings, type Forms } from '../content/types';

/** Jediné místo, kde se text písmen/slabik/slov vykresluje. Tvar písma (velká/malá tiskací, psací)
 *  určí nastavení `settings` (později z rodičovské sekce); zatím se používá výchozí velká tiskací. */
export const DEFAULT_SCRIPT_SETTINGS: AppScriptSettings = {
  mode: 'upperPrint',
  available: { upperPrint: true, lowerPrint: false, cursive: false },
};

export default function Glyphs({ forms, settings = DEFAULT_SCRIPT_SETTINGS, className }: { forms: Forms; settings?: AppScriptSettings; className?: string }) {
  return <span className={className} data-script={settings.available[settings.mode] ? settings.mode : 'upperPrint'}>{formText(forms, settings)}</span>;
}
