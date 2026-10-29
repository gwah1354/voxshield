"""VoxShield Audio Cleaner Engine.

Performs real-time capable noise reduction on audio signals using spectral gating.
Discloses the algorithm method directly and provides fallback handling.
"""

from __future__ import annotations

import io
import time
from typing import BinaryIO, Dict, Tuple, Union

import numpy as np
import soundfile as sf

try:
    import noisereduce as nr
    _NOISEREDUCE_AVAILABLE = True
except ImportError:
    _NOISEREDUCE_AVAILABLE = False

from scipy import signal


def load_audio(
    file_source: Union[str, BinaryIO, bytes, io.BytesIO]
) -> Tuple[np.ndarray, int]:
    """Load audio from file path or file-like binary object.

    Returns:
        Tuple of (audio_data: np.ndarray, sample_rate: int).
        audio_data is normalized to float32.
    """
    if isinstance(file_source, bytes):
        file_source = io.BytesIO(file_source)

    try:
        data, sample_rate = sf.read(file_source, dtype="float32")
    except Exception as exc:
        raise ValueError(f"Could not read audio file: {exc}") from exc

    if data.size == 0:
        raise ValueError("Audio file is empty.")

    # Ensure shape is finite
    if not np.isfinite(data).all():
        data = np.nan_to_num(data, nan=0.0, posinf=1.0, neginf=-1.0)

    return data, sample_rate


def save_audio_to_bytes(data: np.ndarray, sample_rate: int) -> bytes:
    """Save audio array to in-memory WAV bytes."""
    buffer = io.BytesIO()
    # Clip to standard float bounds to avoid clipping distortion
    clipped = np.clip(data, -1.0, 1.0)
    sf.write(buffer, clipped, sample_rate, format="WAV", subtype="PCM_16")
    buffer.seek(0)
    return buffer.read()


def _scipy_fallback_filter(data: np.ndarray, sample_rate: int) -> np.ndarray:
    """Fallback filter when noisereduce is unavailable.

    Applies a voice-frequency Butterworth bandpass (80 Hz - 3800 Hz)
    plus high-frequency smoothing.
    """
    nyquist = 0.5 * sample_rate
    lowcut = max(80.0, 20.0)
    highcut = min(3800.0, nyquist - 100.0)

    if lowcut >= highcut:
        # Extreme low sample rate case
        return data

    b, a = signal.butter(4, [lowcut / nyquist, highcut / nyquist], btype="band")
    if data.ndim == 1:
        filtered = signal.filtfilt(b, a, data)
    else:
        # Multichannel
        filtered = np.zeros_like(data)
        for ch in range(data.shape[1]):
            filtered[:, ch] = signal.filtfilt(b, a, data[:, ch])
    return filtered


def clean_audio(
    data: np.ndarray,
    sample_rate: int,
    prop_decrease: float = 0.85,
    stationary: bool = False,
) -> Tuple[np.ndarray, Dict[str, Union[float, int, str, bool]]]:
    """Clean noisy audio using real noise reduction.

    Args:
        data: Audio samples as float32 array (mono 1D or multichannel [N, C]).
        sample_rate: Sampling frequency in Hz.
        prop_decrease: Proportion of noise to reduce (0.0 to 1.0).
        stationary: If True, assumes stationary background noise.
                    If False, uses non-stationary adaptive spectral gating.

    Returns:
        (cleaned_audio, metadata_dict)
    """
    if data.size == 0:
        raise ValueError("Cannot clean empty audio array.")

    prop_decrease = float(np.clip(prop_decrease, 0.0, 1.0))
    channels = 1 if data.ndim == 1 else data.shape[1]
    samples_count = len(data) if data.ndim == 1 else data.shape[0]
    duration_seconds = samples_count / float(sample_rate)

    start_time = time.perf_counter()
    method_used = "noisereduce_spectral_gating"

    if _NOISEREDUCE_AVAILABLE:
        try:
            # noisereduce supports 1D or 2D (samples, channels) or (channels, samples)
            # When multichannel, noisereduce expects channel dimension.
            if data.ndim == 1:
                cleaned = nr.reduce_noise(
                    y=data,
                    sr=sample_rate,
                    prop_decrease=prop_decrease,
                    stationary=stationary,
                )
            else:
                # Transpose to (channels, samples) for noisereduce if needed, or pass directly
                cleaned = nr.reduce_noise(
                    y=data.T,
                    sr=sample_rate,
                    prop_decrease=prop_decrease,
                    stationary=stationary,
                ).T
        except Exception:
            # Fall back safely if noisereduce encountered a numerical edge case
            cleaned = _scipy_fallback_filter(data, sample_rate)
            method_used = "fallback_scipy_bandpass"
    else:
        cleaned = _scipy_fallback_filter(data, sample_rate)
        method_used = "fallback_scipy_bandpass"

    elapsed_time = max(time.perf_counter() - start_time, 1e-6)
    real_time_factor = duration_seconds / elapsed_time

    # Normalize volume output to prevent harsh volume drops
    max_orig = np.max(np.abs(data)) if np.max(np.abs(data)) > 0 else 1.0
    max_clean = np.max(np.abs(cleaned)) if np.max(np.abs(cleaned)) > 0 else 1.0
    if max_clean > 0:
        cleaned = cleaned * (min(1.0, max_orig / max_clean * 0.95))

    cleaned = np.clip(cleaned, -1.0, 1.0).astype(np.float32)

    metadata: Dict[str, Union[float, int, str, bool]] = {
        "duration_seconds": round(duration_seconds, 3),
        "processing_time_seconds": round(elapsed_time, 4),
        "real_time_factor": round(real_time_factor, 2),
        "sample_rate": sample_rate,
        "channels": channels,
        "method_used": method_used,
        "stationary_mode": stationary,
        "prop_decrease": prop_decrease,
    }

    return cleaned, metadata


def generate_sample_noisy_audio(
    duration_sec: float = 3.0,
    sample_rate: int = 16000
) -> Tuple[np.ndarray, int]:
    """Generate a realistic synthetic test signal with simulated rotor/engine noise and impulsive bursts.

    This ensures anyone evaluating the prototype can test without needing their own WAV file.
    """
    total_samples = int(duration_sec * sample_rate)
    t = np.linspace(0, duration_sec, total_samples, endpoint=False)

    # 1. Synthetic speech-like formants (simulating vowels: "One, Two, Alpha")
    # Base pitch ~140Hz with harmonic formants at 700Hz and 2200Hz
    voice = (
        0.5 * np.sin(2 * np.pi * 140 * t) * (1 + 0.5 * np.sin(2 * np.pi * 3 * t))
        + 0.3 * np.sin(2 * np.pi * 700 * t)
        + 0.2 * np.sin(2 * np.pi * 2200 * t)
    )
    # Speech envelope (pulsed bursts simulating words)
    speech_env = np.clip(np.sin(2 * np.pi * 1.5 * t) ** 4, 0.05, 1.0)
    speech = voice * speech_env

    # 2. Helicopter rotor / heavy engine drone (low-frequency pulsing ~25Hz + harmonics)
    rotor_drone = (
        0.4 * np.sin(2 * np.pi * 25 * t)
        + 0.3 * np.sin(2 * np.pi * 50 * t)
        + 0.2 * np.sin(2 * np.pi * 100 * t)
    )

    # 3. Ambient radio static / wideband white noise
    rng = np.random.default_rng(seed=42)
    static = rng.normal(0, 0.15, total_samples)

    # 4. Impulsive burst (simulated distant blast/gunshot transient around t=1.2s)
    blast = np.zeros(total_samples)
    blast_idx = int(1.2 * sample_rate)
    decay_samples = int(0.08 * sample_rate)
    if blast_idx + decay_samples < total_samples:
        blast_noise = rng.normal(0, 0.8, decay_samples)
        decay = np.exp(-np.linspace(0, 5, decay_samples))
        blast[blast_idx:blast_idx + decay_samples] = blast_noise * decay

    mixed = speech + rotor_drone + static + blast
    # Normalize to [-0.95, 0.95]
    mixed = (mixed / np.max(np.abs(mixed)) * 0.95).astype(np.float32)

    return mixed, sample_rate
