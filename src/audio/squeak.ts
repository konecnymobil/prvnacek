/** Jemné „pískání“ (WebAudio), když tah vyjede z koridoru; utichne po návratu. Žádný soubor, jen oscilátor. */
let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gain: GainNode | null = null;

export function squeakOn(): void {
  if (osc) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    void ctx.resume?.();
    osc = ctx.createOscillator();
    gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1250;
    gain.gain.value = 0.035; // potichu
    osc.connect(gain).connect(ctx.destination);
    osc.start();
  } catch { osc = null; }
}

export function squeakOff(): void {
  if (!osc) return;
  try { osc.stop(); osc.disconnect(); gain?.disconnect(); } catch { /* už zastaveno */ }
  osc = null; gain = null;
}
export const isSqueaking = () => osc !== null;
