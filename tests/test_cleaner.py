"""Unit tests for VoxShield audio cleaner module."""

import numpy as np
import pytest

from voxshield.cleaner import (
    _scipy_fallback_filter,
    clean_audio,
    generate_sample_noisy_audio,
    load_audio,
    save_audio_to_bytes,
)


def test_generate_sample_noisy_audio():
    data, sr = generate_sample_noisy_audio(duration_sec=1.0, sample_rate=16000)
    assert sr == 16000
    assert len(data) == 16000
    assert data.dtype == np.float32
    assert np.all(np.isfinite(data))
    assert np.max(np.abs(data)) <= 1.0


def test_save_and_load_audio_bytes():
    data, sr = generate_sample_noisy_audio(duration_sec=0.5, sample_rate=16000)
    wav_bytes = save_audio_to_bytes(data, sr)
    assert isinstance(wav_bytes, bytes)
    assert len(wav_bytes) > 0

    reloaded_data, reloaded_sr = load_audio(wav_bytes)
    assert reloaded_sr == sr
    assert len(reloaded_data) == len(data)
    assert np.all(np.isfinite(reloaded_data))


def test_clean_audio_mono():
    data, sr = generate_sample_noisy_audio(duration_sec=1.0, sample_rate=16000)
    cleaned, meta = clean_audio(data, sr, prop_decrease=0.8, stationary=False)

    assert cleaned.shape == data.shape
    assert np.all(np.isfinite(cleaned))
    assert meta["duration_seconds"] == pytest.approx(1.0, rel=1e-2)
    assert meta["processing_time_seconds"] > 0
    assert meta["real_time_factor"] > 0
    assert meta["sample_rate"] == 16000
    assert meta["channels"] == 1
    assert "method_used" in meta


def test_clean_audio_stereo():
    data, sr = generate_sample_noisy_audio(duration_sec=0.5, sample_rate=16000)
    # Create stereo 2D array [samples, 2]
    stereo_data = np.column_stack([data, data])
    cleaned, meta = clean_audio(stereo_data, sr, prop_decrease=0.7, stationary=True)

    assert cleaned.shape == (len(data), 2)
    assert np.all(np.isfinite(cleaned))
    assert meta["channels"] == 2
    assert meta["duration_seconds"] == pytest.approx(0.5, rel=1e-2)


def test_scipy_fallback_filter():
    data, sr = generate_sample_noisy_audio(duration_sec=0.5, sample_rate=16000)
    filtered = _scipy_fallback_filter(data, sr)

    assert filtered.shape == data.shape
    assert np.all(np.isfinite(filtered))


def test_empty_audio_raises_error():
    empty_data = np.array([], dtype=np.float32)
    with pytest.raises(ValueError):
        clean_audio(empty_data, sample_rate=16000)


def test_invalid_audio_bytes_raises_error():
    corrupted_bytes = b"NOT_A_VALID_WAV_HEADER"
    with pytest.raises(ValueError):
        load_audio(corrupted_bytes)
