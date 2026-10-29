// Client-side audio utilities. Browser APIs are only touched inside functions,
// so this module is safe to import during server rendering.

export type Settings = { strength: number; highpass: number; lowpass: number; normalize: boolean };
export const DEFAULTS: Settings = { strength: 0.5, highpass: 100, lowpass: 7000, normalize: true };
export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_SECONDS = 300;

function audioCtor(): typeof AudioContext {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const C = w.AudioContext ?? w.webkitAudioContext;
  if (!C) throw new Error("This browser does not support the Web Audio API.");
  return C;
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = new (audioCtor())();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new Error("Your browser could not decode this audio. Try a WAV file.");
  } finally {
    void ctx.close();
  }
}

function rms(b: AudioBuffer): number {
  const d = b.getChannelData(0);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, d.length));
}

function channels(b: AudioBuffer): Float32Array[] {
  return Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
}

/** Simulated test sample: speech + looped user-supplied noise. level = noise RMS relative to speech RMS. */
export async function mixNoise(speech: AudioBuffer, noise: AudioBuffer, level: number): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(speech.numberOfChannels, speech.length, speech.sampleRate);
  const s = off.createBufferSource();
  s.buffer = speech;
  s.connect(off.destination);
  const n = off.createBufferSource();
  n.buffer = noise;
  n.loop = true;
  const g = off.createGain();
  g.gain.value = (level * rms(speech)) / Math.max(rms(noise), 1e-6);
  n.connect(g).connect(off.destination);
  s.start();
  n.start();
  const out = await off.startRendering();
  normalizeChannels(channels(out), 0.89, true); // only scale down, to avoid clipping the mix
  return out;
}

/**
 * Downward noise gate with an adaptive floor. The floor is the 10th-percentile
 * frame level; frames below a threshold above that floor are attenuated with a
 * soft knee and smoothed gain (fast attack, slow release). Operates in place.
 * It cannot remove noise that is as loud as the speech.
 */
export function gateChannels(chs: Float32Array[], sr: number, strength: number): void {
  if (strength <= 0 || chs.length === 0) return;
  const n = chs[0].length;
  const frame = Math.max(1, Math.round(sr * 0.02));
  const nf = Math.ceil(n / frame);
  const lvl = new Float32Array(nf);
  for (let f = 0; f < nf; f++) {
    let s = 0, c = 0;
    for (const ch of chs) for (let i = f * frame; i < Math.min(n, (f + 1) * frame); i++) { s += ch[i] * ch[i]; c++; }
    lvl[f] = Math.sqrt(s / Math.max(1, c));
  }
  const sorted = Array.from(lvl).sort((a, b) => a - b);
  const floor = Math.max(sorted[Math.floor(nf * 0.1)] || 0, 1e-5);
  const thr = floor * (1 + strength * 3);
  const minGain = 1 - 0.9 * strength;
  const atk = 1 - Math.exp(-1 / (sr * 0.005));
  const rel = 1 - Math.exp(-1 / (sr * 0.08));
  let g = 1;
  for (let f = 0; f < nf; f++) {
    const r = lvl[f] / thr;
    const target = r >= 1 ? 1 : minGain + (1 - minGain) * r * r;
    for (let i = f * frame; i < Math.min(n, (f + 1) * frame); i++) {
      g += (target - g) * (target > g ? atk : rel);
      for (const ch of chs) ch[i] *= g;
    }
  }
}

/** Scales so the peak equals `peak` (in place). With downOnly, only scales down. */
export function normalizeChannels(chs: Float32Array[], peak: number, downOnly = false): void {
  let m = 0;
  for (const ch of chs) for (let i = 0; i < ch.length; i++) m = Math.max(m, Math.abs(ch[i]));
  if (m === 0 || (downOnly && m <= peak)) return;
  const k = peak / m;
  for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] *= k;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Baseline pipeline: high-pass -> low-pass (Web Audio biquads) -> adaptive noise gate -> optional peak normalize. */
export async function enhance(input: AudioBuffer, st: Settings, onProgress: (p: number) => void): Promise<AudioBuffer> {
  onProgress(0.05);
  await tick();
  const off = new OfflineAudioContext(input.numberOfChannels, input.length, input.sampleRate);
  const src = off.createBufferSource();
  src.buffer = input;
  const hp = off.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = st.highpass;
  const lp = off.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.min(st.lowpass, input.sampleRate * 0.45);
  src.connect(hp).connect(lp).connect(off.destination);
  src.start();
  const out = await off.startRendering();
  onProgress(0.6);
  await tick();
  const chs = channels(out);
  gateChannels(chs, out.sampleRate, st.strength);
  onProgress(0.85);
  await tick();
  if (st.normalize) normalizeChannels(chs, 0.89);
  onProgress(1);
  return out;
}

/** 16-bit PCM WAV encoder. */
export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels, n = buf.length, bytes = n * ch * 2;
  const ab = new ArrayBuffer(44 + bytes);
  const v = new DataView(ab);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + bytes, true); w(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, bytes, true);
  const d = channels(buf);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, d[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}
