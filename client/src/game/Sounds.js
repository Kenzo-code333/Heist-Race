// ============================================================================
// client/src/game/Sounds.js
// ----------------------------------------------------------------------------
// Tiny synthesized sounds (no audio files): a police siren and short alert
// beeps, made with the browser's Web Audio API. An "oscillator" produces a
// tone; a "gain" node controls its volume.
// ============================================================================

export class Sounds {
  constructor() {
    this.ctx = null;
    this.siren = null;
  }

  // Browsers only allow audio after the user interacted with the page, so we
  // create the audio context lazily.
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** A short beep (e.g. when spotted). */
  beep(frequency = 880, duration = 0.15, volume = 0.08) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  /** Start/stop the wailing police siren. */
  setSiren(on) {
    if (on && !this.siren) {
      const ctx = this.ensure();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const wobble = ctx.createOscillator(); // slowly moves the pitch up and down
      const wobbleDepth = ctx.createGain();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 720;
      wobble.frequency.value = 0.5;
      wobbleDepth.gain.value = 260;
      wobble.connect(wobbleDepth).connect(osc.frequency);
      gain.gain.value = 0.025;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      wobble.start();
      this.siren = { osc, wobble };
    } else if (!on && this.siren) {
      this.siren.osc.stop();
      this.siren.wobble.stop();
      this.siren = null;
    }
  }
}
