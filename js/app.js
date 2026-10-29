/**
 * VoxShield Main Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  let audioCtx = null;
  let currentOriginalBuffer = null;
  let currentOriginalBlob = null;
  let currentCleanedBlob = null;
  let currentFileName = "";

  // Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const btnGenerateSample = document.getElementById('btnGenerateSample');
  const activeFileBanner = document.getElementById('activeFileBanner');
  const activeFileName = document.getElementById('activeFileName');
  const activeFileMeta = document.getElementById('activeFileMeta');

  const strengthSlider = document.getElementById('strengthSlider');
  const strengthValue = document.getElementById('strengthValue');
  const modeSelect = document.getElementById('modeSelect');

  const btnProcess = document.getElementById('btnProcess');
  const processBtnText = document.getElementById('processBtnText');
  const processSpinner = document.getElementById('processSpinner');

  const resultsSection = document.getElementById('resultsSection');
  const canvasOriginal = document.getElementById('canvasOriginal');
  const canvasProcessed = document.getElementById('canvasProcessed');
  const audioOriginal = document.getElementById('audioOriginal');
  const audioProcessed = document.getElementById('audioProcessed');
  const btnDownload = document.getElementById('btnDownload');

  const metricDuration = document.getElementById('metricDuration');
  const metricLatency = document.getElementById('metricLatency');
  const metricRtf = document.getElementById('metricRtf');
  const metricAlgorithm = document.getElementById('metricAlgorithm');

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Slider change
  strengthSlider.addEventListener('input', (e) => {
    strengthValue.textContent = `${Math.round(e.target.value * 100)}%`;
  });

  // Dropzone drag & drop
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleUploadedFile(files[0]);
    }
  });

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleUploadedFile(e.target.files[0]);
    }
  });

  // Handle uploaded file
  async function handleUploadedFile(file) {
    if (!file.type.includes('audio') && !file.name.toLowerCase().endsWith('.wav')) {
      alert("Please upload an audio file in WAV format.");
      return;
    }

    try {
      const ctx = initAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

      currentOriginalBuffer = decodedBuffer;
      currentOriginalBlob = file;
      currentFileName = file.name;

      showActiveFile(
        file.name,
        `${(file.size / 1024).toFixed(1)} KB • ${(decodedBuffer.duration).toFixed(2)}s • ${decodedBuffer.sampleRate} Hz`
      );

      prepareComparisonUI(decodedBuffer);
    } catch (err) {
      console.error(err);
      alert(`Could not decode audio file: ${err.message}. Please ensure it is a valid WAV audio file.`);
    }
  }

  // Generate synthetic sample
  btnGenerateSample.addEventListener('click', () => {
    try {
      const ctx = initAudioContext();
      const sample = VoxShieldDSP.generateSyntheticSample(ctx, 3.2, 16000);
      currentOriginalBuffer = sample.buffer;
      currentOriginalBlob = sample.wavBlob;
      currentFileName = "voxshield_rotor_sample.wav";

      showActiveFile(
        "⚡ Synthetic Rotor + Radio Noise Sample",
        `3.20s • 16000 Hz Mono • Simulated Formants & Rotor Drone`
      );

      prepareComparisonUI(sample.buffer);
    } catch (err) {
      console.error(err);
      alert(`Error generating sample: ${err.message}`);
    }
  });

  function showActiveFile(name, meta) {
    activeFileName.textContent = name;
    activeFileMeta.textContent = meta;
    activeFileBanner.style.display = 'flex';
    btnProcess.disabled = false;
  }

  function prepareComparisonUI(buffer) {
    resultsSection.style.display = 'block';

    // Original Audio setup
    const origUrl = URL.createObjectURL(currentOriginalBlob);
    audioOriginal.src = origUrl;

    // Draw original waveform
    canvasOriginal.width = canvasOriginal.parentElement.clientWidth || 400;
    canvasOriginal.height = 80;
    VoxShieldDSP.drawWaveform(canvasOriginal, buffer, '#ef4444');

    // Clear processed elements until process button is clicked
    audioProcessed.removeAttribute('src');
    btnDownload.style.display = 'none';
    const ctxClean = canvasProcessed.getContext('2d');
    canvasProcessed.width = canvasProcessed.parentElement.clientWidth || 400;
    canvasProcessed.height = 80;
    ctxClean.clearRect(0, 0, canvasProcessed.width, canvasProcessed.height);

    // Scroll smoothly to studio action
    btnProcess.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Process Audio
  btnProcess.addEventListener('click', async () => {
    if (!currentOriginalBuffer) return;

    btnProcess.disabled = true;
    processBtnText.textContent = "Processing Audio...";
    processSpinner.style.display = 'inline-block';

    try {
      const ctx = initAudioContext();
      const strength = parseFloat(strengthSlider.value);
      const isStationary = modeSelect.value === 'stationary';

      // Small async tick to let spinner render
      await new Promise(r => setTimeout(r, 60));

      const result = await VoxShieldDSP.processAudioBuffer(ctx, currentOriginalBuffer, {
        strength: strength,
        stationary: isStationary
      });

      currentCleanedBlob = result.wavBlob;
      const cleanedUrl = URL.createObjectURL(result.wavBlob);
      audioProcessed.src = cleanedUrl;

      // Draw cleaned waveform
      canvasProcessed.width = canvasProcessed.parentElement.clientWidth || 400;
      canvasProcessed.height = 80;
      VoxShieldDSP.drawWaveform(canvasProcessed, result.outputBuffer, '#00e5ff');

      // Setup download button
      btnDownload.href = cleanedUrl;
      const baseName = currentFileName.replace(/\.[^/.]+$/, "");
      btnDownload.download = `${baseName}_voxshield_cleaned.wav`;
      btnDownload.style.display = 'inline-flex';

      // Populate Telemetry Metrics
      metricDuration.textContent = `${result.metadata.durationSeconds}s`;
      metricLatency.textContent = `${result.metadata.processingTimeMs} ms`;
      metricRtf.textContent = `${result.metadata.realTimeFactor}x`;
      metricAlgorithm.textContent = result.metadata.method;

      // Play processed audio automatically
      audioProcessed.play().catch(() => {});
    } catch (err) {
      console.error(err);
      alert(`Processing failed: ${err.message}`);
    } finally {
      btnProcess.disabled = false;
      processBtnText.textContent = "🛡️ Shield & Clean Audio";
      processSpinner.style.display = 'none';
    }
  });

  // Handle window resize for canvas redraw
  window.addEventListener('resize', () => {
    if (currentOriginalBuffer) {
      canvasOriginal.width = canvasOriginal.parentElement.clientWidth || 400;
      VoxShieldDSP.drawWaveform(canvasOriginal, currentOriginalBuffer, '#ef4444');
    }
  });
});
