/**
 * Low-latency audio: pre-decoded Web Audio buffers, zero decode in hot path.
 * Hit/kill/click/reload sounds synthesized offline at init (no assets needed).
 * @module engine/audio
 */

export type HitSoundKind = 'click' | 'tick' | 'thock' | 'beep';
type BufferKind = HitSoundKind | 'shot';

export class SoundBank {
  private ctx: AudioContext | null = null;
  private buffers = new Map<BufferKind, AudioBuffer>();
  private master: GainNode | null = null;
  private hitGain: GainNode | null = null;
  private masterVolume = 0.8;
  private hitVolume = 0.9;

  /** Must be called from a user gesture at least once. */
  /* v8 ignore start — requires real AudioContext (browser-only) */
  ensure(): AudioContext {
    if (!this.ctx) {
      const w = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AC = w.AudioContext ?? w.webkitAudioContext;
      if (!AC) throw new Error('Web Audio not supported');
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.hitGain = this.ctx.createGain();
      this.hitGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolumes();
      this.predecodeAll();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setVolumes(master: number, hit: number): void {
    this.masterVolume = master;
    this.hitVolume = hit;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.master) this.master.gain.value = this.masterVolume;
    if (this.hitGain) this.hitGain.gain.value = this.hitVolume;
  }

  private predecodeAll(): void {
    if (!this.ctx) return;
    const kinds: BufferKind[] = ['click', 'tick', 'thock', 'beep', 'shot'];
    for (const k of kinds) this.buffers.set(k, this.synth(k));
  }

  /** Synthesize a short percussive buffer offline (deterministic). */
  private synth(kind: BufferKind): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    if (kind === 'shot') return this.synthShot(ctx);
    const dur = kind === 'beep' ? 0.09 : 0.05;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    const freq = kind === 'click' ? 2400 : kind === 'tick' ? 3200 : kind === 'thock' ? 900 : 1200;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * (kind === 'thock' ? 60 : 140));
      d[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.9;
    }
    return buf;
  }

  /** Dull muzzle report: low thump + filtered-noise crack. Quieter than hit cues so hits stay readable. */
  private synthShot(ctx: AudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(sr * 0.07), sr);
    const d = buf.getChannelData(0);
    let seed = 12345; // fixed LCG: identical buffer every session
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      lp += 0.35 * ((seed / 0xffffffff) * 2 - 1 - lp);
      const thump = Math.sin(2 * Math.PI * (180 - 1200 * t) * t) * Math.exp(-t * 55);
      d[i] = (lp * Math.exp(-t * 90) * 0.7 + thump * 0.6) * 0.55;
    }
    return buf;
  }

  /** Muzzle report on every trigger pull (hit or miss). */
  playShot(): void {
    this.playBuffer('shot', 1);
  }

  /** Fire-and-forget playback from the pre-decoded buffer (no allocation of note). */
  play(kind: HitSoundKind, rate = 1): void {
    this.playBuffer(kind, rate);
  }

  private playBuffer(kind: BufferKind, rate: number): void {
    if (!this.ctx || !this.hitGain) return;
    const buf = this.buffers.get(kind);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(this.hitGain);
    src.start();
  }
  /* v8 ignore stop */
}

export const soundBank = new SoundBank();
