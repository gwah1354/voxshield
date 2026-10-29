/**
 * VoxShield DSP & Audio Processing Core
 * Implements real-time capable spectral gating, voice-band filtering,
 * WAV encoding, and synthetic noise generation without external dependencies.
 */

const VoxShieldDSP = {
  /**
   * Encodes Float32Array channel data to standard 16-bit PCM WAV Blob.
   */
  encodeWAV(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF identifier
    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this._writeString(view, 8, 'WAVE');

    // fmt subchunk
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // BitsPerSample (16 bits)

    // data subchunk
    this._writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave channel samples and write 16-bit integers
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = channels[ch][i];
        // Clip to [-1.0, 1.0]
        sample = Math.max(-1, Math.min(1, sample));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  },

  _writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  },

  /**
   * Real noise reduction DSP:
   * 1. 2nd-order Biquad Bandpass preserving human speech (80 Hz - 3600 Hz).
   * 2. Adaptive Spectral Gating (dynamic threshold expansion).
   * 3. Peak normalization and soft-limiting.
   */
  async processAudioBuffer(audioCtx, inputBuffer, options = {}) {
    const strength = options.strength !== undefined ? options.strength : 0.85;
    const isStationary = options.stationary || false;
    const numChannels = inputBuffer.numberOfChannels;
    const length = inputBuffer.length;
    const sampleRate = inputBuffer.sampleRate;

    const startTime = performance.now();

    // Create output buffer
    const outputBuffer = audioCtx.createBuffer(numChannels, length, sampleRate);

    // Bandpass filter coefficients (speech communications standard: ~80Hz - 3600Hz)
    // Lowpass cutoff ~3600Hz to strip harsh gunfire/hiss harmonics
    // Highpass cutoff ~80Hz to eliminate mechanical and rotor thumps
    for (let ch = 0; ch < numChannels; ch++) {
      const inputData = inputBuffer.getChannelData(ch);
      const outputData = outputBuffer.getChannelData(ch);

      // Step 1: Pre-filter (Voice Bandpass)
      const filtered = this._applyVoiceBandpass(inputData, sampleRate);

      // Step 2: Spectral & Dynamic Envelope Noise Gating
      // Estimate rolling noise floor
      const frameSize = Math.floor(sampleRate * 0.025); // 25ms frames
      const hopSize = Math.floor(frameSize / 2);
      const numFrames = Math.floor((length - frameSize) / hopSize);

      // Compute frame RMS energy
      const frameEnergies = new Float32Array(numFrames);
      for (let f = 0; f < numFrames; f++) {
        let sumSq = 0;
        const start = f * hopSize;
        for (let j = 0; j < frameSize; j++) {
          const val = filtered[start + j];
          sumSq += val * val;
        }
        frameEnergies[f] = Math.sqrt(sumSq / frameSize);
      }

      // Estimate noise floor energy percentile (~15th percentile for speech with pauses)
      const sortedEnergies = Float32Array.from(frameEnergies).sort();
      const noiseIndex = Math.floor(sortedEnergies.length * (isStationary ? 0.15 : 0.25));
      const noiseFloor = Math.max(sortedEnergies[noiseIndex] || 0.005, 0.002);
      const gateThreshold = noiseFloor * (1.5 + strength * 2.0);

      // Step 3: Apply smoothed adaptive gain curve
      const gainCurve = new Float32Array(length);
      gainCurve.fill(1.0);

      let currentGain = 1.0;
      const attackCoeff = 0.85;  // Fast voice attack
      const releaseCoeff = 0.95; // Smooth release

      for (let f = 0; f < numFrames; f++) {
        const energy = frameEnergies[f];
        let targetGain = 1.0;

        if (energy < gateThreshold) {
          // Below threshold: attenuate noise aggressively based on strength
          const attenuation = 1.0 - strength * 0.92;
          targetGain = Math.max(attenuation, (energy / gateThreshold) * attenuation);
        }

        // Smooth transition
        currentGain = targetGain > currentGain
          ? attackCoeff * currentGain + (1 - attackCoeff) * targetGain
          : releaseCoeff * currentGain + (1 - releaseCoeff) * targetGain;

        const start = f * hopSize;
        const end = Math.min(start + hopSize, length);
        for (let i = start; i < end; i++) {
          gainCurve[i] = currentGain;
        }
      }

      // Apply gain and copy
      for (let i = 0; i < length; i++) {
        outputData[i] = filtered[i] * gainCurve[i];
      }

      // Step 4: Peak Normalization
      let maxOrig = 0;
      let maxClean = 0;
      for (let i = 0; i < length; i++) {
        const aO = Math.abs(inputData[i]);
        const aC = Math.abs(outputData[i]);
        if (aO > maxOrig) maxOrig = aO;
        if (aC > maxClean) maxClean = aC;
      }

      if (maxClean > 0.0001) {
        const normFactor = Math.min(1.0, (maxOrig / maxClean) * 0.92);
        for (let i = 0; i < length; i++) {
          outputData[i] = Math.max(-1.0, Math.min(1.0, outputData[i] * normFactor));
        }
      }
    }

    const elapsedMs = Math.max(performance.now() - startTime, 0.1);
    const durationSec = length / sampleRate;
    const rtf = (durationSec * 1000) / elapsedMs;

    return {
      outputBuffer,
      wavBlob: this.encodeWAV(outputBuffer),
      metadata: {
        durationSeconds: durationSec.toFixed(2),
        processingTimeMs: elapsedMs.toFixed(1),
        processingTimeSec: (elapsedMs / 1000).toFixed(3),
        realTimeFactor: rtf.toFixed(1),
        sampleRate: sampleRate,
        channels: numChannels,
        method: "Adaptive Spectral Gating + Speech Bandpass (Client DSP)"
      }
    };
  },

  /**
   * Applies 2-pole highpass (80 Hz) and 2-pole lowpass (3600 Hz) filters.
   */
  _applyVoiceBandpass(data, sampleRate) {
    const len = data.length;
    const result = new Float32Array(len);

    // Highpass ~80 Hz
    const hpFreq = 80;
    const hpW0 = 2 * Math.PI * hpFreq / sampleRate;
    const hpAlpha = Math.sin(hpW0) / (2 * 0.707);
    const hpB0 = (1 + Math.cos(hpW0)) / 2;
    const hpB1 = -(1 + Math.cos(hpW0));
    const hpB2 = (1 + Math.cos(hpW0)) / 2;
    const hpA0 = 1 + hpAlpha;
    const hpA1 = -2 * Math.cos(hpW0);
    const hpA2 = 1 - hpAlpha;

    let hpX1 = 0, hpX2 = 0, hpY1 = 0, hpY2 = 0;
    for (let i = 0; i < len; i++) {
      const x = data[i];
      const y = (hpB0 / hpA0) * x + (hpB1 / hpA0) * hpX1 + (hpB2 / hpA0) * hpX2
                - (hpA1 / hpA0) * hpY1 - (hpA2 / hpA0) * hpY2;
      hpX2 = hpX1;
      hpX1 = x;
      hpY2 = hpY1;
      hpY1 = y;
      result[i] = y;
    }

    // Lowpass ~3600 Hz (speech channel cutoff)
    const lpFreq = Math.min(3600, sampleRate * 0.45);
    const lpW0 = 2 * Math.PI * lpFreq / sampleRate;
    const lpAlpha = Math.sin(lpW0) / (2 * 0.707);
    const lpB0 = (1 - Math.cos(lpW0)) / 2;
    const lpB1 = 1 - Math.cos(lpW0);
    const lpB2 = (1 - Math.cos(lpW0)) / 2;
    const lpA0 = 1 + lpAlpha;
    const lpA1 = -2 * Math.cos(lpW0);
    const lpA2 = 1 - lpAlpha;

    let lpX1 = 0, lpX2 = 0, lpY1 = 0, lpY2 = 0;
    for (let i = 0; i < len; i++) {
      const x = result[i];
      const y = (lpB0 / lpA0) * x + (lpB1 / lpA0) * lpX1 + (lpB2 / lpA0) * lpX2
                - (lpA1 / lpA0) * lpY1 - (lpA2 / lpA0) * lpY2;
      lpX2 = lpX1;
      lpX1 = x;
      lpY2 = lpY1;
      lpY1 = y;
      result[i] = y;
    }

    return result;
  },

  /**
   * Generates synthetic radio transmission audio buffer (Voice + Rotor drone + Static).
   */
  generateSyntheticSample(audioCtx, durationSec = 3.2, sampleRate = 16000) {
    const totalSamples = Math.floor(durationSec * sampleRate);
    const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;

      // 1. Voice vowel formant simulation ("Bravo 2-1, heavy rotor inbound")
      const pitch = 140; // Fundamental pitch (Hz)
      const voiceHarmonics =
        0.45 * Math.sin(2 * Math.PI * pitch * t) * (1 + 0.4 * Math.sin(2 * Math.PI * 3 * t))
        + 0.30 * Math.sin(2 * Math.PI * 700 * t)  // Formant 1
        + 0.20 * Math.sin(2 * Math.PI * 2200 * t); // Formant 2

      // Speech rhythm syllables
      const speechEnv = Math.min(1.0, Math.max(0.04, Math.pow(Math.sin(2 * Math.PI * 1.6 * t), 4)));
      const speech = voiceHarmonics * speechEnv;

      // 2. Helicopter rotor / turbine low-frequency drone (25Hz blade pass + harmonics)
      const rotor =
        0.35 * Math.sin(2 * Math.PI * 25 * t)
        + 0.25 * Math.sin(2 * Math.PI * 50 * t)
        + 0.18 * Math.sin(2 * Math.PI * 100 * t);

      // 3. Wideband radio static
      const staticNoise = (Math.random() * 2 - 1) * 0.14;

      // 4. Distant blast transient at t=1.2s
      let blast = 0;
      if (t >= 1.2 && t <= 1.35) {
        const decay = Math.exp(-(t - 1.2) * 25);
        blast = (Math.random() * 2 - 1) * 0.7 * decay;
      }

      channel[i] = speech + rotor + staticNoise + blast;
    }

    // Normalize
    let max = 0;
    for (let i = 0; i < totalSamples; i++) {
      const abs = Math.abs(channel[i]);
      if (abs > max) max = abs;
    }
    if (max > 0) {
      for (let i = 0; i < totalSamples; i++) {
        channel[i] = (channel[i] / max) * 0.95;
      }
    }

    return {
      buffer,
      wavBlob: this.encodeWAV(buffer)
    };
  },

  /**
   * Draws audio waveform on an HTML5 Canvas.
   */
  drawWaveform(canvas, audioBuffer, strokeColor = '#00e5ff') {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Draw center baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(width, amp);
    ctx.stroke();

    // Draw waveform bars / curve
    ctx.fillStyle = strokeColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      const startIdx = i * step;

      for (let j = 0; j < step; j++) {
        const datum = data[startIdx + j] || 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      const yTop = (1 - max) * amp;
      const yBottom = (1 - min) * amp;
      const barHeight = Math.max(1.5, yBottom - yTop);

      ctx.fillRect(i, yTop, 1.2, barHeight);
    }
  }
};

window.VoxShieldDSP = VoxShieldDSP;
