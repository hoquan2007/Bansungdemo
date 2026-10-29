"""Build small, browser-ready CC0 gunshot WAV clips from original recordings.

Prerequisites: Python 3, numpy, scipy and five original WAVs in .asset-staging/.
Original download URLs and licensing are recorded in docs/GUN_AUDIO_ASSETS.md.
Run from fps-next/: python scripts/prepare-gun-audio.py
"""

from pathlib import Path
from math import gcd
import wave

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / '.asset-staging'
OUTPUT = ROOT / 'client' / 'public' / 'audio' / 'guns'
RATE = 24000

# Manual onset markers in the archived field recordings. Each source contains
# long stretches of room noise or other gunshots; the game needs one single shot.
# start (seconds), length (seconds)
CLIPS = {
    'pistol': (1.46, 0.52),
    'rifle': (0.16, 0.45),
    'shotgun': (1.54, 0.63),
    'smg': (0.75, 0.18),
    'sniper': (1.04, 0.64),
}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, (start, duration) in CLIPS.items():
        path = SOURCES / f'{name}.wav'
        if not path.exists():
            raise FileNotFoundError(f'Missing {path}; see docs/GUN_AUDIO_ASSETS.md')
        rate, stereo = wavfile.read(path)
        segment = stereo[int(start * rate):int((start + duration) * rate)]
        if len(segment) == 0:
            raise ValueError(f'Empty clip: {name}')
        # 24-bit PCM is delivered in left-aligned int32 by scipy.io.wavfile.
        max_value = np.iinfo(segment.dtype).max
        mono = segment.astype(np.float64).mean(axis=1) / max_value if segment.ndim > 1 else segment.astype(np.float64) / max_value
        divisor = gcd(rate, RATE)
        mono = resample_poly(mono, RATE // divisor, rate // divisor)
        peak = np.max(np.abs(mono))
        if peak < 0.002:
            raise ValueError(f'Audio unexpectedly silent: {name}')
        mono = np.clip(mono * (0.8 / peak), -0.85, 0.85)
        # Avoid ticks at the beginning or end when voices overlap rapidly.
        fade_in = min(len(mono), int(RATE * 0.006))
        fade_out = min(len(mono), int(RATE * 0.09))
        mono[:fade_in] *= np.linspace(0, 1, fade_in)
        mono[-fade_out:] *= np.linspace(1, 0, fade_out) ** 2
        pcm = (mono * 32767).astype('<i2')
        dest = OUTPUT / f'{name}.wav'
        with wave.open(str(dest), 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(RATE)
            wav.writeframes(pcm.tobytes())
        print(f'{name}: {len(pcm) / RATE:.2f}s, {dest.stat().st_size} bytes')


if __name__ == '__main__':
    main()
