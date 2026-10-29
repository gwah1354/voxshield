"""VoxShield - Audio Noise Reduction Prototype Web App.

Built with Streamlit for hackathon demonstration.
"""

from __future__ import annotations

import streamlit as st

from voxshield.cleaner import (
    clean_audio,
    generate_sample_noisy_audio,
    load_audio,
    save_audio_to_bytes,
)

st.set_page_config(
    page_title="VoxShield - Audio Noise Cleaner",
    page_icon="🛡️",
    layout="centered",
)

# Header Section
st.title("🛡️ VoxShield")
st.subheader("Every word heard, even in the loudest moments.")

st.info(
    "**Prototype Status & Honest Disclosure:**\n\n"
    "This hackathon prototype applies real-time spectral gating noise reduction "
    "using the `noisereduce` engine with Scipy DSP fallback. All duration, processing latency, "
    "and real-time factor metrics shown are real measurements measured on this system."
)

# Sidebar Configuration
st.sidebar.header("Processing Controls")
prop_decrease = st.sidebar.slider(
    "Noise Reduction Strength",
    min_value=0.20,
    max_value=1.00,
    value=0.85,
    step=0.05,
    help="Higher values remove more background noise at the cost of potential slight voice timbre alteration.",
)

noise_mode = st.sidebar.radio(
    "Noise Environment",
    options=["Adaptive / Non-Stationary (Rotors, Sirens)", "Stationary (Constant Engine / Fan Hum)"],
    index=0,
    help="Adaptive tracking handles fluctuating noise; stationary mode works best for steady hums.",
)
is_stationary = "Stationary" in noise_mode

st.sidebar.markdown("---")
st.sidebar.markdown(
    "**VoxShield Project**\n\n"
    "Focus: First Responder & Defence Radio Comms\n\n"
    "Stage: Proof of Concept Prototype"
)

# Audio Source Selection
st.markdown("### 1. Select or Upload Audio")

tab_upload, tab_sample = st.tabs(["📁 Upload WAV File", "⚡ Generate Demo Sample"])

audio_bytes = None
source_label = ""

with tab_upload:
    uploaded_file = st.file_uploader(
        "Upload a noisy voice recording (WAV format only)",
        type=["wav"],
        help="Upload standard mono or stereo 16-bit / 32-bit WAV audio.",
    )
    if uploaded_file is not None:
        audio_bytes = uploaded_file.read()
        source_label = f"Uploaded File: {uploaded_file.name}"

with tab_sample:
    st.write(
        "No WAV file on hand? Click below to synthesize a noisy radio transmission "
        "mixing speech formants with helicopter rotor drone and radio static."
    )
    if st.button("Generate & Load Synthetic Sample"):
        with st.spinner("Synthesizing audio sample..."):
            sample_data, sample_sr = generate_sample_noisy_audio(duration_sec=3.0, sample_rate=16000)
            audio_bytes = save_audio_to_bytes(sample_data, sample_sr)
            source_label = "Synthetic Rotor + Radio Noise Sample"
            st.session_state["cached_sample_bytes"] = audio_bytes
            st.session_state["cached_source_label"] = source_label

    if audio_bytes is None and "cached_sample_bytes" in st.session_state:
        audio_bytes = st.session_state["cached_sample_bytes"]
        source_label = st.session_state.get("cached_source_label", "Synthetic Sample")

# Processing Section
if audio_bytes:
    st.markdown("---")
    st.markdown(f"**Current Input:** `{source_label}`")

    try:
        raw_data, sample_rate = load_audio(audio_bytes)
        duration_sec = len(raw_data) / float(sample_rate) if raw_data.ndim == 1 else raw_data.shape[0] / float(sample_rate)
        st.write(f"Sample Rate: **{sample_rate} Hz** | Duration: **{duration_sec:.2f} s**")
    except Exception as exc:
        st.error(f"Error loading audio file: {exc}")
        raw_data = None

    if raw_data is not None:
        col_orig, col_clean = st.columns(2)

        with col_orig:
            st.markdown("#### 🔊 Original (Noisy)")
            st.audio(audio_bytes, format="audio/wav")

        if st.button("🛡️ Clean Audio with VoxShield", type="primary", use_container_width=True):
            with st.spinner("Processing speech and filtering noise..."):
                try:
                    cleaned_data, metadata = clean_audio(
                        raw_data,
                        sample_rate,
                        prop_decrease=prop_decrease,
                        stationary=is_stationary,
                    )
                    cleaned_bytes = save_audio_to_bytes(cleaned_data, sample_rate)

                    with col_clean:
                        st.markdown("#### ✨ Processed (VoxShield)")
                        st.audio(cleaned_bytes, format="audio/wav")
                        st.download_button(
                            label="⬇️ Download Cleaned WAV",
                            data=cleaned_bytes,
                            file_name="voxshield_cleaned.wav",
                            mime="audio/wav",
                            use_container_width=True,
                        )

                    # Performance Metrics Display
                    st.markdown("### 📊 Real Processing Metrics")
                    m1, m2, m3, m4 = st.columns(4)
                    m1.metric("Audio Duration", f"{metadata['duration_seconds']} s")
                    m2.metric("Processing Time", f"{metadata['processing_time_seconds']} s")
                    m3.metric("Real-Time Factor", f"{metadata['real_time_factor']}x")
                    m4.metric("Algorithm", str(metadata['method_used']))

                    if metadata["real_time_factor"] >= 1.0:
                        st.success(
                            f"Execution is **{metadata['real_time_factor']}x faster than real-time**, "
                            "meeting latency constraints for low-power edge deployment."
                        )
                    else:
                        st.warning(
                            f"Processing took longer than real-time ({metadata['real_time_factor']}x). "
                            "Consider reducing sample length for live streams."
                        )

                except Exception as exc:
                    st.error(f"Processing error: {exc}")
else:
    st.write("Please upload a WAV file or generate a demo sample above to begin.")
