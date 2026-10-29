# VoxShield

> Every word heard, even in the loudest moments.

VoxShield is a student hackathon prototype for improving speech clarity in noisy recordings, aimed at emergency responders, rescue teams, firefighters and police. It runs entirely in the browser: no backend, database, API keys or paid services.

**Status:** early prototype. It is a signal-processing baseline, **not** a trained AI model. It has not been validated for emergency, military or field use.

## The problem
Radio and recorded speech in sirens, engines, wind and crowds can be hard to understand. VoxShield demonstrates the workflow: load noisy speech, enhance it, compare before and after.

## How it works
1. Audio is uploaded or recorded, then decoded with the Web Audio API.
2. `OfflineAudioContext` applies a high-pass and a low-pass biquad filter.
3. An adaptive noise gate (`gateChannels` in `lib/audio.ts`) attenuates quiet, noise-floor sections with smoothed gain.
4. Optional peak normalization (−1 dBFS), then export as 16-bit PCM WAV.
5. Test mode mixes a user-supplied noise recording into speech at an adjustable level, clearly labelled as simulated.

No metrics such as PESQ or STOI are shown, because none are computed.

## Architecture
- `app/page.tsx`: client-side UI (upload, record, settings, comparison, download)
- `lib/audio.ts`: decoding, noise mixing, filtering, gate, normalization, WAV encoding
- `components/Waveform.tsx`: canvas waveform view

## Stack
Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS 3, Web Audio API.

## Run locally
Requires Node.js 18.18 or newer.
```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Deploy on Vercel
1. Push this repo to GitHub.
2. In Vercel choose **Add New → Project**, import the repo, keep the defaults (Framework: Next.js) and select **Deploy**. No environment variables are needed.

## Limitations
- Filters can distort speech where noise overlaps speech frequencies.
- Loud, sustained noise (sirens, gunfire, rotors) will largely remain.
- Whole-file offline processing only; no real-time or radio integration.
- Browser codec support varies; WAV is the safest input.

## Future work
- Integrate a trained speech-enhancement model (for example, an ONNX model running in the browser) behind the existing `enhance()` interface.
- Evaluate on public noisy-speech datasets with proper metrics and listening tests.
- Real-time streaming input and user testing.

## AI disclosure
This project was developed with the assistance of AI coding tools.

## Licence
MIT, see `LICENSE`.
