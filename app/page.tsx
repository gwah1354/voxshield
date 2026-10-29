"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Waveform from "@/components/Waveform";
import { DEFAULTS, MAX_BYTES, MAX_SECONDS, Settings, decodeBlob, encodeWav, enhance, mixNoise } from "@/lib/audio";

function useWavUrl(buf: AudioBuffer | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!buf) { setUrl(null); return; }
    const u = URL.createObjectURL(encodeWav(buf));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [buf]);
  return url;
}

const card = "rounded-lg border border-line bg-panel p-5";
const btn = "rounded-md border border-line px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-40 disabled:hover:border-line";
const primary = "rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-40";
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function Home() {
  const [name, setName] = useState("");
  const [clean, setClean] = useState<AudioBuffer | null>(null);
  const [working, setWorking] = useState<AudioBuffer | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [noise, setNoise] = useState<AudioBuffer | null>(null);
  const [noiseName, setNoiseName] = useState("");
  const [noiseLevel, setNoiseLevel] = useState(0.5);
  const [processed, setProcessed] = useState<AudioBuffer | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);

  const origUrl = useWavUrl(working);
  const procUrl = useWavUrl(processed);

  const loadSpeech = useCallback(async (blob: Blob, label: string) => {
    setError("");
    try {
      const buf = await decodeBlob(blob);
      if (buf.duration > MAX_SECONDS) throw new Error(`Recording is too long. Maximum is ${fmt(MAX_SECONDS)}.`);
      setName(label); setClean(buf); setWorking(buf); setSimulated(false); setProcessed(null); setMs(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load audio."); }
  }, []);

  const checkFile = (f: File) => {
    if (!(f.type.startsWith("audio/") || /\.(wav|mp3|ogg|m4a|flac|webm)$/i.test(f.name))) { setError("Unsupported file type. Choose an audio file, preferably WAV."); return false; }
    if (f.size > MAX_BYTES) { setError(`File is larger than ${MAX_BYTES / 1024 / 1024} MB.`); return false; }
    return true;
  };

  const onSpeechFile = (f?: File) => { if (f && checkFile(f)) void loadSpeech(f, f.name); };
  const onNoiseFile = async (f?: File) => {
    if (!f || !checkFile(f)) return;
    try { setNoise(await decodeBlob(f)); setNoiseName(f.name); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load noise file."); }
  };

  const startRec = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        void loadSpeech(new Blob(chunks, { type: mr.mimeType }), "microphone-recording");
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
      setTimeout(() => { if (mr.state === "recording") mr.stop(); }, 30000);
    } catch { setError("Microphone unavailable or permission denied. You can upload a file instead."); }
  };
  const stopRec = () => recRef.current?.state === "recording" && recRef.current.stop();

  const reset = () => { setName(""); setClean(null); setWorking(null); setProcessed(null); setMs(null); setSimulated(false); setError(""); };

  const makeNoisy = async () => {
    if (!clean || !noise) return;
    try { setWorking(await mixNoise(clean, noise, noiseLevel)); setSimulated(true); setProcessed(null); setMs(null); }
    catch { setError("Could not mix the noise into the sample."); }
  };

  const run = async () => {
    if (!working) return;
    setError(""); setProgress(0);
    const t0 = performance.now();
    try { const out = await enhance(working, settings, setProgress); setProcessed(out); setMs(performance.now() - t0); }
    catch { setError("Processing failed in this browser. Try a shorter WAV file."); }
    finally { setProgress(null); }
  };

  const slider = (label: string, key: keyof Settings, min: number, max: number, step: number, show: string) => (
    <label className="block text-sm">
      <span className="flex justify-between"><span>{label}</span><span className="text-accent">{show}</span></span>
      <input type="range" min={min} max={max} step={step} value={settings[key] as number}
        onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })} />
    </label>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <header className="flex items-center justify-between border-b border-line py-4">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38d0f0" strokeWidth="2" aria-hidden><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8 12h1.5l1.5-3 2 6 1.5-3H16" /></svg>
          VoxShield
        </div>
        <span className="rounded border border-line px-2 py-1 text-xs text-slate-300">Student prototype · signal-processing baseline</span>
      </header>

      <section className="py-10">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Every word heard, even in the loudest moments.</h1>
        <p className="mt-4 max-w-2xl text-slate-300">
          Load a noisy speech recording, run it through a filtering and noise-gate pipeline in your browser, and compare the result with the original.
          Nothing is uploaded: all processing happens on your device.
        </p>
      </section>

      {error && <div role="alert" className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

      <div className="grid gap-4 md:grid-cols-5">
        <section className={`${card} md:col-span-3`}>
          <h2 className="mb-3 text-lg font-semibold">1. Audio input</h2>
          <div className="flex flex-wrap gap-2">
            <label className={`${btn} cursor-pointer`}>
              Upload audio
              <input type="file" accept="audio/*,.wav" className="sr-only" onChange={(e) => { onSpeechFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {!recording ? <button className={btn} onClick={startRec}>Record from microphone</button> : <button className={`${btn} border-red-400`} onClick={stopRec}>Stop recording</button>}
            <button className={btn} onClick={reset} disabled={!working}>Remove</button>
          </div>
          <p className="mt-2 text-xs text-slate-400">WAV recommended. Also accepts MP3, OGG, M4A, FLAC if your browser can decode them. Max 25 MB, 5 minutes. Microphone clips stop at 30 seconds.</p>
          {working ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm"><span className="font-medium">{name}</span> · {fmt(working.duration)} · {working.sampleRate} Hz · {working.numberOfChannels} ch
                {simulated && <span className="ml-2 rounded bg-amber-400/20 px-2 py-0.5 text-xs text-amber-200">Simulated noisy sample</span>}</p>
              <Waveform buffer={working} label="Original waveform" />
              {origUrl && <audio controls src={origUrl} aria-label="Original audio" />}
            </div>
          ) : <p className="mt-4 text-sm text-slate-400">No recording loaded. Upload a file or record a few seconds to begin.</p>}
        </section>

        <section className={`${card} md:col-span-2`}>
          <h2 className="mb-3 text-lg font-semibold">2. Processing settings</h2>
          <div className="space-y-4">
            {slider("Noise reduction strength", "strength", 0, 1, 0.05, `${Math.round(settings.strength * 100)}%`)}
            {slider("High-pass cutoff", "highpass", 20, 500, 10, `${settings.highpass} Hz`)}
            {slider("Low-pass cutoff", "lowpass", 2000, 12000, 250, `${settings.lowpass} Hz`)}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.normalize} onChange={(e) => setSettings({ ...settings, normalize: e.target.checked })} />
              Normalize peak level (−1 dBFS)
            </label>
            <div className="flex gap-2">
              <button className={primary} onClick={run} disabled={!working || progress !== null}>{progress !== null ? "Processing…" : "Enhance audio"}</button>
              <button className={btn} onClick={() => setSettings(DEFAULTS)}>Reset</button>
            </div>
            {progress !== null && <div className="h-2 overflow-hidden rounded bg-ink" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-accent transition-all" style={{ width: `${progress * 100}%` }} /></div>}
          </div>
        </section>

        <section className={`${card} md:col-span-5`}>
          <h2 className="mb-1 text-lg font-semibold">3. Test mode: add simulated noise</h2>
          <p className="mb-3 text-sm text-slate-400">Mix your own noise recording into the loaded speech to create a test sample. Bring your own noise file; nothing is downloaded for you.</p>
          <div className="flex flex-wrap items-center gap-4">
            <label className={`${btn} cursor-pointer`}>
              {noiseName ? `Noise: ${noiseName}` : "Upload noise recording"}
              <input type="file" accept="audio/*,.wav" className="sr-only" onChange={(e) => { void onNoiseFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <label className="block min-w-[200px] flex-1 text-sm">
              <span className="flex justify-between"><span>Noise level vs. speech</span><span className="text-accent">{Math.round(noiseLevel * 100)}%</span></span>
              <input type="range" min={0.05} max={1.5} step={0.05} value={noiseLevel} onChange={(e) => setNoiseLevel(Number(e.target.value))} />
            </label>
            <button className={btn} onClick={makeNoisy} disabled={!clean || !noise}>Generate noisy sample</button>
            <button className={btn} onClick={() => { if (clean) { setWorking(clean); setSimulated(false); setProcessed(null); setMs(null); } }} disabled={!simulated}>Use clean speech</button>
          </div>
        </section>

        <section className={`${card} md:col-span-5`}>
          <h2 className="mb-3 text-lg font-semibold">4. Before and after</h2>
          {processed ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><h3 className="text-sm font-medium text-slate-300">Original</h3><Waveform buffer={working} label="Original waveform" />{origUrl && <audio controls src={origUrl} aria-label="Original audio" />}</div>
              <div className="space-y-2"><h3 className="text-sm font-medium text-accent">Processed</h3><Waveform buffer={processed} label="Processed waveform" />{procUrl && <audio controls src={procUrl} aria-label="Processed audio" />}</div>
              <div className="flex flex-wrap items-center gap-4 md:col-span-2">
                {procUrl && <a className={primary} href={procUrl} download={`${(name || "voxshield").replace(/\.[^.]+$/, "")}-voxshield.wav`}>Download processed WAV</a>}
                {ms !== null && <span className="text-sm text-slate-400">Processed in {(ms / 1000).toFixed(2)} s</span>}
              </div>
              <p className="text-xs text-slate-400 md:col-span-2">No quality scores are shown because none are measured. Judge the result by listening. Settings changed after processing apply on the next run.</p>
            </div>
          ) : <p className="text-sm text-slate-400">Load audio and select Enhance audio to see the comparison here.</p>}
        </section>
      </div>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <div className={card}>
          <h2 className="mb-2 font-semibold">How it works</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>The file is decoded with the Web Audio API.</li>
            <li>A high-pass filter reduces low-frequency rumble; a low-pass filter trims high-frequency hiss.</li>
            <li>An adaptive noise gate estimates the quietest 10% of the recording and attenuates sections near that level.</li>
            <li>Optional peak normalization raises the level without clipping, then the result is encoded as 16-bit WAV.</li>
          </ol>
          <p className="mt-3 text-sm text-slate-400">This is a classical signal-processing baseline, not a trained AI model. <code className="text-accent">lib/audio.ts</code> is structured so a real speech-enhancement model can replace <code className="text-accent">enhance()</code> later.</p>
        </div>
        <div className={card}>
          <h2 className="mb-2 font-semibold">Limitations</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>Filters can distort speech, especially when noise overlaps speech frequencies (roughly 300–3400 Hz).</li>
            <li>The gate cannot remove noise that is as loud as the speech, such as sustained sirens, gunfire or rotor noise.</li>
            <li>No real-time radio, embedded-device or field testing has been done. Not validated for emergency or defence use.</li>
            <li>Offline processing of whole files only; very long files may be slow on phones.</li>
          </ul>
        </div>
      </section>

      <footer className="mt-10 border-t border-line pt-4 text-xs text-slate-500">
        VoxShield is an early student hackathon prototype released under the MIT licence. Built with AI coding assistance.
      </footer>
    </div>
  );
}
