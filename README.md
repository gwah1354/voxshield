# 🛡️ VoxShield: Audio Noise Reduction Prototype

> **"Every word heard, even in the loudest moments."**

VoxShield is an AI/DSP audio noise reduction prototype designed for emergency responders (firefighters, disaster rescue, police, ambulances) and tactical communications operating in extreme acoustic noise (helicopter rotors, heavy machinery, sirens, and gunfire).

This repository contains the minimal working hackathon prototype developed for **MY Bharat Hack for Social Cause** (*Disaster Mitigation & Resilience*) and the **Wadhwani Entrepreneurship Programme**.

---

## 📌 Features

- **WAV Audio Upload**: Upload mono or stereo WAV files directly through an intuitive web interface.
- **Instant Synthetic Demo Generator**: Synthesize a test transmission mixing voice formants with helicopter rotor drone and radio static with one click—no external audio files required.
- **Genuine Noise Reduction**: Uses real spectral gating (`noisereduce`) with a reliable Scipy DSP bandpass fallback.
- **Side-by-Side Audio Comparison**: Listen to the original noisy signal and the cleaned output side-by-side.
- **Real Execution Metrics**: Accurately measures audio duration, processing execution time, and real-time factor (RTF).
- **Downloadable Cleaned Audio**: Export processed audio directly as 16-bit PCM WAV.

---

## 🔬 Honest Project Status & Disclosure

- **Stage**: Hackathon prototype & proof-of-concept.
- **Algorithm**: Adaptive non-stationary and stationary spectral gating implemented via Python's `noisereduce` library, backed by Scipy.
- **No Faked Claims**: We do not simulate or fake AI processing, benchmark scores, or military field tests. All execution times and audio outputs are genuine.

---

## 🚀 Quickstart

### 1. Prerequisites
- Python 3.10+ (tested on Python 3.12)
- Git

### 2. Installation

Clone this repository and install the dependencies:

```bash
git clone https://github.com/your-username/voxshield.git
cd voxshield
pip install -r requirements.txt
```

### 3. Launch Web App

Start the Streamlit interface:

```bash
streamlit run app.py
```

The app will open automatically in your browser at `http://localhost:8501`.

---

## 🧪 Running Tests

A full suite of unit tests validates audio loading, saving, noise cleaning, multichannel handling, and fallback behavior:

```bash
pytest
```

---

## 📁 Repository Structure

```
voxshield/
├── voxshield/
│   ├── __init__.py       # Package definition
│   └── cleaner.py        # Real noise-reduction logic and metrics
├── tests/
│   ├── __init__.py
│   └── test_cleaner.py   # Pytest suite
├── app.py                # Streamlit web application
├── requirements.txt      # Dependency specification
├── LICENSE               # MIT License
├── .gitignore            # Git exclusion rules
└── README.md             # Project documentation
```

---

## 👥 Team VoxShield

- **B. Shanjeev** (Data & Benchmark Pipeline)
- **R. Sachin** (Model & Training)
- **K. Vasanthan** (Hardware, Testing & Evaluation)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
