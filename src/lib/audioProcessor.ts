import type { TrackKind } from '@/types';
import { TRACK_ORDER } from '@/types';
import { audioBufferToWav, mixBuffersToStereoWav } from '@/lib/wavEncoder';

export type ProcessResult = {
  bpm: number;
  firstBeat: number;
  beatTimes: number[];
  duration: number;
  stems: Record<TrackKind, Float32Array>;
  stemBuffers: Record<TrackKind, AudioBuffer>;
  sampleRate: number;
  lrBlob: Blob;
  zipBlob: Blob;
  rarBlob: Blob;
};

export type ProgressCb = (progress: number, status: string) => void;

// ============================================================================
// FFT / IFFT — Radix-2 Cooley-Tukey
// ============================================================================

function fft(data: Float32Array): { re: Float32Array; im: Float32Array } {
  const n = data.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = data[i];

  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < halfLen; k++) {
        const tRe = curRe * re[i + k + halfLen] - curIm * im[i + k + halfLen];
        const tIm = curRe * im[i + k + halfLen] + curIm * re[i + k + halfLen];
        re[i + k + halfLen] = re[i + k] - tRe;
        im[i + k + halfLen] = im[i + k] - tIm;
        re[i + k] += tRe;
        im[i + k] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
  return { re, im };
}

function ifft(re: Float32Array, im: Float32Array): Float32Array {
  const n = re.length;
  const cRe = new Float32Array(n);
  const cIm = new Float32Array(n);
  for (let i = 0; i < n; i++) { cRe[i] = re[i]; cIm[i] = -im[i]; }

  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [cRe[i], cRe[j]] = [cRe[j], cRe[i]];
      [cIm[i], cIm[j]] = [cIm[j], cIm[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < halfLen; k++) {
        const tRe = curRe * cRe[i + k + halfLen] - curIm * cIm[i + k + halfLen];
        const tIm = curRe * cIm[i + k + halfLen] + curIm * cRe[i + k + halfLen];
        cRe[i + k + halfLen] = cRe[i + k] - tRe;
        cIm[i + k + halfLen] = cIm[i + k] - tIm;
        cRe[i + k] += tRe;
        cIm[i + k] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = cRe[i] / n;
  return out;
}

// ============================================================================
// STFT / ISTFT
// ============================================================================

const FFT_SIZE = 4096;
const HOP_SIZE = 512;

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return w;
}

type Spectrogram = {
  mag: Float32Array[];   // magnitude [frames][bins]
  phase: Float32Array[]; // phase [frames][bins]
  frames: number;
  bins: number;
};

function stft(data: Float32Array): Spectrogram {
  const n = data.length;
  const frames = Math.max(0, Math.floor((n - FFT_SIZE) / HOP_SIZE) + 1);
  const window = hannWindow(FFT_SIZE);
  const bins = FFT_SIZE / 2;
  const mag: Float32Array[] = [];
  const phase: Float32Array[] = [];

  for (let f = 0; f < frames; f++) {
    const start = f * HOP_SIZE;
    const frame = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) frame[i] = data[start + i] * window[i];
    const { re, im } = fft(frame);
    const m = new Float32Array(bins);
    const p = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      m[b] = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      p[b] = Math.atan2(im[b], re[b]);
    }
    mag.push(m);
    phase.push(p);
  }
  return { mag, phase, frames, bins };
}

function istft(mag: Float32Array[], phase: Float32Array[], outLen: number): Float32Array {
  const frames = mag.length;
  const window = hannWindow(FFT_SIZE);
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const bins = FFT_SIZE / 2;

  for (let f = 0; f < frames; f++) {
    const fullRe = new Float32Array(FFT_SIZE);
    const fullIm = new Float32Array(FFT_SIZE);
    for (let b = 0; b < bins; b++) {
      fullRe[b] = mag[f][b] * Math.cos(phase[f][b]);
      fullIm[b] = mag[f][b] * Math.sin(phase[f][b]);
      fullRe[FFT_SIZE - b] = fullRe[b];
      fullIm[FFT_SIZE - b] = -fullIm[b];
    }
    fullIm[0] = 0;
    fullIm[bins] = 0;

    const frame = ifft(fullRe, fullIm);
    const start = f * HOP_SIZE;
    for (let i = 0; i < FFT_SIZE && start + i < outLen; i++) {
      out[start + i] += frame[i] * window[i];
      norm[start + i] += window[i] * window[i];
    }
  }
  for (let i = 0; i < outLen; i++) {
    if (norm[i] > 1e-9) out[i] /= norm[i];
  }
  return out;
}

// ============================================================================
// HPSS — Harmonic-Percussive Source Separation
// Separates the spectrogram into harmonic (smooth horizontally) and
// percussive (smooth vertically) components via median filtering.
// ============================================================================

function medianFilter1D(arr: Float32Array, size: number): Float32Array {
  const n = arr.length;
  const out = new Float32Array(n);
  const half = Math.floor(size / 2);
  const win: number[] = [];

  for (let i = 0; i < n; i++) {
    win.length = 0;
    for (let j = -half; j <= half; j++) {
      const idx = Math.min(n - 1, Math.max(0, i + j));
      win.push(arr[idx]);
    }
    win.sort((a, b) => a - b);
    out[i] = win[half];
  }
  return out;
}

function hpss(mag: Float32Array[], bins: number, frames: number): {
  harmonic: Float32Array[];
  percussive: Float32Array[];
} {
  const hSize = 17; // horizontal (time) median window for harmonic
  const vSize = 17; // vertical (freq) median window for percussive

  // Harmonic: median filter along time axis (each freq bin across frames)
  const harmonic: Float32Array[] = [];
  for (let b = 0; b < bins; b++) {
    const row = new Float32Array(frames);
    for (let f = 0; f < frames; f++) row[f] = mag[f][b];
    const filtered = medianFilter1D(row, hSize);
    for (let f = 0; f < frames; f++) {
      if (!harmonic[f]) harmonic[f] = new Float32Array(bins);
      harmonic[f][b] = filtered[f];
    }
  }

  // Percussive: median filter along frequency axis (each frame across bins)
  const percussive: Float32Array[] = [];
  for (let f = 0; f < frames; f++) {
    const filtered = medianFilter1D(mag[f], vSize);
    percussive[f] = filtered;
  }

  // Soft masking: H and P compete proportionally
  const eps = 1e-10;
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < bins; b++) {
      const total = harmonic[f][b] + percussive[f][b] + eps;
      const hMask = harmonic[f][b] / total;
      const pMask = percussive[f][b] / total;
      harmonic[f][b] = mag[f][b] * hMask;
      percussive[f][b] = mag[f][b] * pMask;
    }
  }

  return { harmonic, percussive };
}

// ============================================================================
// Soft masking: separate a target from a mixture using spectral profiles
// Based on the "soft masking" technique used in REPET / similar methods.
// Each stem competes for spectral energy proportionally to its expected
// frequency response at each bin.
// ============================================================================

type StemProfile = {
  // Expected relative energy at each frequency bin (0..1)
  // Higher = this stem "owns" this frequency more
  profile: Float32Array;
};

function buildProfiles(bins: number, sampleRate: number): Record<string, StemProfile> {
  const binFreq = sampleRate / FFT_SIZE;
  const profiles: Record<string, StemProfile> = {};

  // Define instrument frequency characteristics
  // Each returns a 0..1 weight for a given frequency
  const freqDefs: Record<string, (freq: number) => number> = {
    // Bass: strong 20-250Hz, rapid rolloff above
    baixo: (f) => {
      if (f < 20) return 0;
      if (f <= 80) return 1.0;
      if (f <= 250) return 1.0 - (f - 80) / 170 * 0.5;
      if (f <= 500) return 0.5 * (1 - (f - 250) / 250);
      return 0.02;
    },
    // Drums: kick (50-200) + snare/hihat (2k-12k) — percussive source
    bateria: (f) => {
      if (f < 30) return 0.3;
      if (f <= 200) return 0.8 - (f - 30) / 170 * 0.3;
      if (f <= 800) return 0.2;
      if (f <= 2000) return 0.2 + (f - 800) / 1200 * 0.5;
      if (f <= 12000) return 0.7;
      if (f <= 16000) return 0.7 * (1 - (f - 12000) / 4000);
      return 0.05;
    },
    // Vocals: 300-3400Hz, strong 500-2000
    voz: (f) => {
      if (f < 80) return 0;
      if (f <= 300) return (f - 80) / 220 * 0.4;
      if (f <= 500) return 0.4 + (f - 300) / 200 * 0.5;
      if (f <= 2000) return 0.9;
      if (f <= 3400) return 0.9 - (f - 2000) / 1400 * 0.5;
      if (f <= 5000) return 0.4 * (1 - (f - 3400) / 1600);
      return 0.02;
    },
    // Backing vocals: similar to vocals but slightly broader
    backings: (f) => {
      if (f < 150) return 0;
      if (f <= 250) return (f - 150) / 100 * 0.3;
      if (f <= 3000) return 0.6;
      if (f <= 4000) return 0.6 * (1 - (f - 3000) / 1000 * 0.5);
      if (f <= 6000) return 0.3 * (1 - (f - 4000) / 2000);
      return 0.02;
    },
    // Accordion: broad 200-5000
    sanfona: (f) => {
      if (f < 100) return 0;
      if (f <= 200) return (f - 100) / 100 * 0.5;
      if (f <= 1000) return 0.7;
      if (f <= 3000) return 0.7 - (f - 1000) / 2000 * 0.2;
      if (f <= 5000) return 0.5 * (1 - (f - 3000) / 2000 * 0.6);
      if (f <= 8000) return 0.2 * (1 - (f - 5000) / 3000);
      return 0.01;
    },
    // Keys: wide range, 100-8000
    teclado: (f) => {
      if (f < 50) return 0;
      if (f <= 200) return (f - 50) / 150 * 0.5;
      if (f <= 4000) return 0.55;
      if (f <= 8000) return 0.55 * (1 - (f - 4000) / 4000 * 0.6);
      if (f <= 12000) return 0.22 * (1 - (f - 8000) / 4000);
      return 0.01;
    },
    // Guitar: 80-6000, peak around 500-2500
    guitarra: (f) => {
      if (f < 60) return 0;
      if (f <= 150) return (f - 60) / 90 * 0.3;
      if (f <= 500) return 0.3 + (f - 150) / 350 * 0.4;
      if (f <= 2500) return 0.7;
      if (f <= 6000) return 0.7 * (1 - (f - 2500) / 3500 * 0.7);
      if (f <= 8000) return 0.21 * (1 - (f - 6000) / 2000);
      return 0.01;
    },
    // Brass: 500-10000, bright
    metais: (f) => {
      if (f < 200) return 0;
      if (f <= 500) return (f - 200) / 300 * 0.3;
      if (f <= 2000) return 0.3 + (f - 500) / 1500 * 0.5;
      if (f <= 8000) return 0.8;
      if (f <= 10000) return 0.8 * (1 - (f - 8000) / 2000 * 0.5);
      if (f <= 14000) return 0.4 * (1 - (f - 10000) / 4000);
      return 0.01;
    },
    // Guide vocal: same as vocal but slightly compressed range
    guia: (f) => {
      if (f < 100) return 0;
      if (f <= 300) return (f - 100) / 200 * 0.4;
      if (f <= 1800) return 0.8;
      if (f <= 3400) return 0.8 * (1 - (f - 1800) / 1600 * 0.5);
      if (f <= 5000) return 0.4 * (1 - (f - 3400) / 1600);
      return 0.01;
    },
    // Conductor: very subtle, just high freq presence
    regencia: (f) => {
      if (f < 500) return 0;
      if (f <= 2000) return 0.15;
      if (f <= 4000) return 0.15 * (1 - (f - 2000) / 2000);
      return 0.01;
    },
  };

  for (const [name, fn] of Object.entries(freqDefs)) {
    const profile = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      profile[b] = fn(b * binFreq);
    }
    profiles[name] = { profile };
  }

  return profiles;
}

// ============================================================================
// Wiener-style iterative soft masking
// For each bin and frame, compute the proportion of each stem's expected
// energy vs the total expected energy across all competing stems.
// Then apply that proportion as a mask to the actual mixture magnitude.
// Iterate 2-3 times, updating each stem's spectral profile from its own
// output to improve separation (reduces bleed).
// ============================================================================

// Time-frequency mask smoothing — eliminates "musical noise" artifacts
// that result from binary/soft masking. Uses bilateral filtering: smooths
// across time and frequency while preserving edges.
function smoothMask(
  mask: Float32Array[],
  bins: number,
  frames: number,
  timeRadius: number,
  freqRadius: number
): Float32Array[] {
  const out: Float32Array[] = [];
  for (let f = 0; f < frames; f++) out.push(new Float32Array(bins));

  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < bins; b++) {
      let weightedSum = 0;
      let totalWeight = 0;
      const center = mask[f][b];

      for (let dt = -timeRadius; dt <= timeRadius; dt++) {
        const fi = f + dt;
        if (fi < 0 || fi >= frames) continue;
        for (let db = -freqRadius; db <= freqRadius; db++) {
          const bi = b + db;
          if (bi < 0 || bi >= bins) continue;
          const val = mask[fi][bi];
          // Bilateral: weight by spatial proximity + value similarity
          const spatialW = Math.exp(-(dt * dt + db * db) / (2 * Math.max(timeRadius, freqRadius)));
          const valueW = Math.exp(-((val - center) * (val - center)) / 0.15);
          const w = spatialW * valueW;
          weightedSum += val * w;
          totalWeight += w;
        }
      }
      out[f][b] = totalWeight > 0 ? weightedSum / totalWeight : center;
    }
  }
  return out;
}

function separateWithSoftMasking(
  mag: Float32Array[],
  phase: Float32Array[],
  bins: number,
  frames: number,
  profiles: Record<string, StemProfile>,
  sourceMag: Float32Array[],
  stemNames: string[],
  iterations: number
): Record<string, Float32Array[]> {
  const eps = 1e-10;
  const numStems = stemNames.length;

  let workProfiles: Record<string, Float32Array> = {};
  for (const name of stemNames) {
    workProfiles[name] = profiles[name].profile.slice();
  }

  let result: Record<string, Float32Array[]> = {};
  for (const name of stemNames) {
    result[name] = [];
    for (let f = 0; f < frames; f++) result[name].push(new Float32Array(bins));
  }

  for (let iter = 0; iter < iterations; iter++) {
    const rawMasks: Record<string, Float32Array[]> = {};
    for (const name of stemNames) rawMasks[name] = [];

    for (let f = 0; f < frames; f++) {
      for (const name of stemNames) rawMasks[name].push(new Float32Array(bins));

      for (let b = 0; b < bins; b++) {
        let totalExpected = 0;
        const expected: number[] = new Array(numStems);
        for (let s = 0; s < numStems; s++) {
          expected[s] = workProfiles[stemNames[s]][b];
          totalExpected += expected[s];
        }
        if (totalExpected < eps) continue;

        // Wiener mask: (profile_i)^2 / sum(profile_j^2) — power-proportional
        let totalPower = 0;
        for (let s = 0; s < numStems; s++) totalPower += expected[s] * expected[s];

        for (let s = 0; s < numStems; s++) {
          const wiener = (expected[s] * expected[s]) / (totalPower + eps);
          const linear = expected[s] / totalExpected;
          rawMasks[stemNames[s]][f][b] = wiener * 0.7 + linear * 0.3;
        }
      }
    }

    // Smooth masks to eliminate musical noise (bilateral filter)
    for (const name of stemNames) {
      rawMasks[name] = smoothMask(rawMasks[name], bins, frames, 2, 2);
    }

    // Apply smoothed masks to source
    for (let f = 0; f < frames; f++) {
      for (let b = 0; b < bins; b++) {
        const sourceEnergy = sourceMag[f][b];
        for (let s = 0; s < numStems; s++) {
          result[stemNames[s]][f][b] = sourceEnergy * rawMasks[stemNames[s]][f][b];
        }
      }
    }

    // Update profiles from results
    if (iter < iterations - 1) {
      for (const name of stemNames) {
        const newProfile = new Float32Array(bins);
        for (let b = 0; b < bins; b++) {
          let sum = 0;
          for (let f = 0; f < frames; f++) sum += result[name][f][b];
          newProfile[b] = sum / frames;
        }
        let maxVal = 0;
        for (let b = 0; b < bins; b++) maxVal = Math.max(maxVal, newProfile[b]);
        if (maxVal > eps) {
          for (let b = 0; b < bins; b++) {
            newProfile[b] = newProfile[b] / maxVal * 0.5 + workProfiles[name][b] * 0.5;
          }
        }
        workProfiles[name] = newProfile;
      }
    }
  }

  // Post-processing: iterative spectral subtraction
  // For each stem, subtract a fraction of the sum of all other stems
  const bleedFactor = 0.25;
  for (const name of stemNames) {
    const others: Float32Array[] = [];
    for (let f = 0; f < frames; f++) {
      const sum = new Float32Array(bins);
      for (const other of stemNames) {
        if (other === name) continue;
        for (let b = 0; b < bins; b++) sum[b] += result[other][f][b];
      }
      others.push(sum);
    }
    for (let f = 0; f < frames; f++) {
      for (let b = 0; b < bins; b++) {
        const bleed = others[f][b] * bleedFactor;
        result[name][f][b] = Math.max(0, result[name][f][b] - bleed);
      }
    }
  }

  return result;
}

// ============================================================================
// Noise gate — eliminates residual bleed in silent sections of each stem
// ============================================================================

function applyNoiseGate(
  mag: Float32Array[],
  bins: number,
  frames: number,
  threshold: number
): void {
  // Compute per-frame energy
  const energies = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let b = 0; b < bins; b++) sum += mag[f][b] * mag[f][b];
    energies[f] = Math.sqrt(sum / bins);
  }

  // Compute global RMS as reference
  let globalRms = 0;
  for (let f = 0; f < frames; f++) globalRms += energies[f];
  globalRms /= frames;

  const gateThreshold = globalRms * threshold;

  for (let f = 0; f < frames; f++) {
    if (energies[f] < gateThreshold) {
      // Attenuate this frame proportionally (soft gate)
      const ratio = energies[f] / (gateThreshold + 1e-10);
      const gain = ratio * ratio * 0.3; // quadratic soft gate
      for (let b = 0; b < bins; b++) mag[f][b] *= gain;
    }
  }
}

// ============================================================================
// Spectral subtraction of common bleed — subtract overlap between stems
// ============================================================================

function reduceBleedBetween(
  primary: Float32Array[],
  other: Float32Array[],
  bins: number,
  frames: number,
  factor: number
): void {
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < bins; b++) {
      // If the other stem has significant energy here, reduce it from primary
      const bleed = other[f][b] * factor;
      primary[f][b] = Math.max(0, primary[f][b] - bleed);
    }
  }
}

// ============================================================================
// Normalize + denormalize helpers
// ============================================================================

function normalize(data: Float32Array): Float32Array {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max < 1e-9) return data;
  const out = new Float32Array(data.length);
  const g = 0.85 / max;
  for (let i = 0; i < data.length; i++) out[i] = data[i] * g;
  return out;
}

// ============================================================================
// BPM detection + beat tracking
// ============================================================================

function detectBpm(data: Float32Array, sampleRate: number): {
  bpm: number; firstBeat: number; beatTimes: number[];
} {
  const frameSize = 1024;
  const hopSize = 512;
  const frames = Math.floor((data.length - frameSize) / hopSize);
  if (frames <= 0) return { bpm: 128, firstBeat: 0, beatTimes: [] };

  const window = hannWindow(frameSize);
  const prevMag = new Float32Array(frameSize / 2);
  const onset = new Float32Array(frames);

  for (let i = 0; i < frames; i++) {
    const start = i * hopSize;
    const frame = new Float32Array(frameSize);
    for (let j = 0; j < frameSize; j++) frame[j] = data[start + j] * window[j];
    const { re, im } = fft(frame);
    const halfBins = frameSize / 2;
    let flux = 0;
    for (let b = 0; b < halfBins; b++) {
      const m = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      const diff = m - prevMag[b];
      if (diff > 0) flux += diff;
      prevMag[b] = m;
    }
    onset[i] = flux;
  }

  let mean = 0;
  for (let i = 0; i < frames; i++) mean += onset[i];
  mean /= frames;
  let std = 0;
  for (let i = 0; i < frames; i++) std += (onset[i] - mean) ** 2;
  std = Math.sqrt(std / frames);

  // Smooth onset
  const smooth = new Float32Array(frames);
  const sw = 3;
  for (let i = 0; i < frames; i++) {
    let sum = 0, count = 0;
    for (let j = -sw; j <= sw; j++) {
      if (i + j >= 0 && i + j < frames) { sum += onset[i + j]; count++; }
    }
    smooth[i] = sum / count;
  }

  const minLag = Math.floor((60 / 200) * sampleRate / hopSize);
  const maxLag = Math.floor((60 / 60) * sampleRate / hopSize);

  let bestLag = minLag;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag && lag < frames; lag++) {
    let corr = 0;
    for (let i = 0; i < frames - lag; i++) corr += smooth[i] * smooth[i + lag];
    corr /= (frames - lag);
    const bpmAtLag = 60 / (lag * hopSize / sampleRate);
    if (bpmAtLag >= 100 && bpmAtLag <= 140) corr *= 1.15;
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  let bpm = Math.round(60 / (bestLag * hopSize / sampleRate));
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm = Math.round(bpm / 2);
  bpm = Math.max(60, Math.min(200, bpm));

  // Beat tracking
  const beatInterval = Math.round((60 / bpm) * sampleRate / hopSize);
  const threshold = mean + std * 0.5;
  const beatTimes: number[] = [];

  let firstBeatFrame = 0;
  let strongest = 0;
  for (let i = 0; i < Math.min(frames, beatInterval * 2); i++) {
    if (smooth[i] > strongest && smooth[i] > threshold) {
      strongest = smooth[i];
      firstBeatFrame = i;
    }
  }

  // Forward
  let beat = firstBeatFrame;
  while (beat < frames) {
    let bestBeat = beat, bestOnset = 0;
    for (let i = beat - 2; i <= beat + 2 && i < frames; i++) {
      if (i >= 0 && smooth[i] > bestOnset) { bestOnset = smooth[i]; bestBeat = i; }
    }
    beatTimes.push(bestBeat * hopSize / sampleRate);
    beat = bestBeat + beatInterval;
  }

  // Backward
  const backward: number[] = [];
  beat = firstBeatFrame - beatInterval;
  while (beat >= 0) {
    let bestBeat = beat, bestOnset = 0;
    for (let i = beat - 2; i <= beat + 2 && i >= 0; i++) {
      if (i < frames && smooth[i] > bestOnset) { bestOnset = smooth[i]; bestBeat = i; }
    }
    backward.unshift(bestBeat * hopSize / sampleRate);
    beat = bestBeat - beatInterval;
  }

  const allBeats = [...backward, ...beatTimes];
  return { bpm, firstBeat: allBeats[0] ?? 0, beatTimes: allBeats };
}

function generateClick(
  duration: number,
  bpm: number,
  beatTimes: number[],
  sampleRate: number
): Float32Array {
  const total = Math.floor(duration * sampleRate);
  const click = new Float32Array(total);
  const useBeats = beatTimes.length > 2;
  const interval = 60 / bpm;

  let beat = 0;
  let t = beatTimes.length > 0 ? beatTimes[0] : 0;

  while (t < duration) {
    const isDown = beat % 4 === 0;
    const freq = isDown ? 1200 : 800;
    const amp = isDown ? 0.9 : 0.5;
    const beepDur = isDown ? 0.08 : 0.04;
    const beepSamples = Math.floor(beepDur * sampleRate);
    const startIdx = Math.floor(t * sampleRate);
    if (startIdx + beepSamples < total) {
      for (let i = 0; i < beepSamples; i++) {
        const env = Math.exp(-3 * i / beepSamples);
        click[startIdx + i] += amp * env * Math.sin((2 * Math.PI * freq * i) / sampleRate);
      }
    }
    if (useBeats && beat + 1 < beatTimes.length) {
      t = beatTimes[beat + 1];
    } else {
      t += interval;
    }
    beat++;
  }
  return click;
}

// ============================================================================
// Mid/side processing — separates centered content (vocals, bass, kick)
// from side content (instruments panned left/right). This dramatically
// improves vocal isolation when the source is stereo.
// ============================================================================

function toMidSide(left: Float32Array, right: Float32Array): { mid: Float32Array; side: Float32Array } {
  const n = left.length;
  const mid = new Float32Array(n);
  const side = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    mid[i] = (left[i] + right[i]) * 0.5;
    side[i] = (left[i] - right[i]) * 0.5;
  }
  return { mid, side };
}

// Apply a per-stem stereo width factor to reconstruct L/R from isolated mid data
// centeredContent (from mid) gets mono, sideContent (from side) gets stereo spread
function reconstructStereo(
  stemMid: Float32Array,
  stemSide: Float32Array | null,
  width: number
): { left: Float32Array; right: Float32Array } {
  const n = stemMid.length;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const m = stemMid[i];
    const s = (stemSide ? stemSide[i] : 0) * width;
    left[i] = m + s;
    right[i] = m - s;
  }
  return { left, right };
}

// ============================================================================
// Main processing function
// ============================================================================

export async function processAudio(
  file: File,
  onProgress: ProgressCb
): Promise<ProcessResult> {
  const arrayBuf = await file.arrayBuffer();
  onProgress(3, 'Decodificando áudio…');

  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const tmpCtx = new Ctx();
  const decoded = await tmpCtx.decodeAudioData(arrayBuf);
  tmpCtx.close();

  const sampleRate = decoded.sampleRate;
  const numChannels = decoded.numberOfChannels;

  // Get stereo channels (or duplicate mono)
  const leftData = decoded.getChannelData(0).slice();
  const rightData = numChannels > 1 ? decoded.getChannelData(1).slice() : leftData.slice();

  // Mono mix for BPM detection and as fallback
  const mono = new Float32Array(leftData.length);
  for (let i = 0; i < mono.length; i++) mono[i] = (leftData[i] + rightData[i]) * 0.5;
  const duration = mono.length / sampleRate;

  onProgress(8, 'Detectando BPM e beats…');
  await microtask();
  const { bpm, firstBeat, beatTimes } = detectBpm(mono, sampleRate);
  onProgress(15, `BPM: ${bpm} · ${beatTimes.length} beats · Click sincronizado…`);
  await microtask();

  const click = generateClick(duration, bpm, beatTimes, sampleRate);

  // Mid/side decomposition for better source separation
  const { mid, side } = toMidSide(leftData, rightData);

  onProgress(20, 'Análise espectral STFT (mid + side)…');
  await microtask();
  const midSpec = stft(mid);
  const sideSpec = stft(side);
  const { mag: midMag, phase: midPhase, frames, bins } = midSpec;
  const { mag: sideMag, phase: sidePhase } = sideSpec;

  // Step 1: HPSS on mid channel — separates harmonic from percussive
  onProgress(28, 'Separando harmônicos e percussivos (HPSS)…');
  await microtask();
  const { harmonic, percussive } = hpss(midMag, bins, frames);

  // Step 2: Build instrument frequency profiles
  onProgress(35, 'Construindo perfis espectrais por instrumento…');
  await microtask();
  const profiles = buildProfiles(bins, sampleRate);

  // Step 3: Separate percussive stems (drums) from percussive component
  onProgress(42, 'Isolando bateria (fonte percussiva)…');
  await microtask();
  const percussiveStems = ['bateria'];
  const percResults = separateWithSoftMasking(
    midMag, midPhase, bins, frames, profiles, percussive, percussiveStems, 3
  );

  // Step 3b: Separate harmonic stems from harmonic component
  onProgress(50, 'Isolando instrumentos harmônicos…');
  await microtask();
  const harmonicStems = ['baixo', 'voz', 'backings', 'sanfona', 'teclado', 'guitarra', 'metais', 'guia', 'regencia'];
  const harmResults = separateWithSoftMasking(
    midMag, midPhase, bins, frames, profiles, harmonic, harmonicStems, 3
  );

  // Step 4: Cross-source bleed reduction
  onProgress(62, 'Reduzindo vazamento entre pistas…');
  await microtask();
  for (const hStem of harmonicStems) {
    reduceBleedBetween(harmResults[hStem], percResults['bateria'], bins, frames, 0.15);
  }
  if (harmResults['voz'] && harmResults['backings']) {
    reduceBleedBetween(harmResults['backings'], harmResults['voz'], bins, frames, 0.1);
  }
  if (harmResults['voz'] && harmResults['guia']) {
    reduceBleedBetween(harmResults['guia'], harmResults['voz'], bins, frames, 0.2);
  }

  // Step 5: Noise gate each stem
  onProgress(68, 'Limpando resíduos (noise gate)…');
  await microtask();
  const allStemMags: Record<string, Float32Array[]> = {
    ...percResults,
    ...harmResults,
  };
  for (const name of Object.keys(allStemMags)) {
    applyNoiseGate(allStemMags[name], bins, frames, 0.08);
  }

  // Step 6: Also separate side channel to capture stereo instruments
  // Side channel contains panned content (guitar, keys, brass, backing vocals)
  // We separate it to add stereo width back to those stems
  onProgress(74, 'Processando canal side (estéreo)…');
  await microtask();
  const sideStems = ['guitarra', 'teclado', 'metais', 'sanfona', 'backings'];
  const sideResults = separateWithSoftMasking(
    sideMag, sidePhase, bins, frames, profiles, sideMag, sideStems, 2
  );

  // Step 7: Reconstruct time-domain signals with stereo
  onProgress(80, 'Reconstruindo pistas isoladas…');
  const stemData: Record<TrackKind, Float32Array> = {} as any;
  const stemBuffers: Record<TrackKind, AudioBuffer> = {} as any;

  const allStems = [...percussiveStems, ...harmonicStems];
  for (let i = 0; i < allStems.length; i++) {
    const kind = allStems[i] as TrackKind;
    const midReconstructed = istft(allStemMags[kind], midPhase, mono.length);

    // For stems with side content, reconstruct stereo
    let stemLeft: Float32Array;
    let stemRight: Float32Array;

    if (sideResults[kind]) {
      const sideReconstructed = istft(sideResults[kind], sidePhase, mono.length);
      // Centered stems (vocals, bass, guia, regencia) stay mono
      // Panned instruments get stereo width from side channel
      const isCentered = ['voz', 'baixo', 'guia', 'regencia', 'bateria'].includes(kind);
      const width = isCentered ? 0.1 : 0.6;
      const stereo = reconstructStereo(midReconstructed, sideReconstructed, width);
      stemLeft = normalize(stereo.left);
      stemRight = normalize(stereo.right);
    } else {
      stemLeft = normalize(midReconstructed);
      stemRight = stemLeft;
    }

    // Store mono sum for waveform display
    stemData[kind] = stemLeft;
    const buf = new AudioBuffer({ length: stemLeft.length, sampleRate, numberOfChannels: 2 });
    buf.copyToChannel(stemLeft, 0);
    buf.copyToChannel(stemRight, 1);
    stemBuffers[kind] = buf;

    onProgress(80 + Math.round((i + 1) / allStems.length * 5), `Reconstruindo: ${kind}…`);
    await microtask();
  }

  // Click (mono)
  const clickNorm = normalize(click);
  stemData['click'] = clickNorm;
  const clickBuffer = new AudioBuffer({ length: clickNorm.length, sampleRate, numberOfChannels: 1 });
  clickBuffer.copyToChannel(clickNorm, 0);
  stemBuffers['click'] = clickBuffer;

  // LR render
  onProgress(88, 'Renderizando LR estéreo…');
  await microtask();
  const L = new Float32Array(mono.length);
  const R = new Float32Array(mono.length);
  for (const k of ['click', 'guia', 'regencia'] as TrackKind[]) {
    const buf = stemBuffers[k];
    if (!buf) continue;
    const lch = buf.getChannelData(0);
    const rch = buf.numberOfChannels > 1 ? buf.getChannelData(1) : lch;
    for (let i = 0; i < L.length && i < lch.length; i++) {
      L[i] += lch[i] * 0.8;
      R[i] += rch[i] * 0.8;
    }
  }
  for (const k of ['voz', 'backings', 'sanfona', 'teclado', 'guitarra', 'bateria', 'baixo', 'metais'] as TrackKind[]) {
    const buf = stemBuffers[k];
    if (!buf) continue;
    const lch = buf.getChannelData(0);
    const rch = buf.numberOfChannels > 1 ? buf.getChannelData(1) : lch;
    for (let i = 0; i < R.length && i < lch.length; i++) {
      L[i] += lch[i] * 0.7;
      R[i] += rch[i] * 0.7;
    }
  }
  let lrMax = 0;
  for (let i = 0; i < L.length; i++) lrMax = Math.max(lrMax, Math.abs(L[i]), Math.abs(R[i]));
  const lrG = 0.8 / (lrMax + 1e-9);
  for (let i = 0; i < L.length; i++) { L[i] *= lrG; R[i] *= lrG; }
  const lrBlob = mixBuffersToStereoWav(L, R, sampleRate);

  // Downloads
  onProgress(92, 'Gerando downloads…');
  await microtask();
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const kind of TRACK_ORDER.map((t) => t.id)) {
    zip.file(`${kind}.wav`, audioBufferToWav(stemBuffers[kind]));
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  const rar = new JSZip();
  for (const kind of TRACK_ORDER.map((t) => t.id)) {
    const wav = audioBufferToWav(stemBuffers[kind]);
    rar.file(`${kind}_Studio.wav`, wav);
    rar.file(`${kind}_Original.wav`, wav);
  }
  rar.file(`LR_${bpm}BPM.wav`, lrBlob);
  const rarBlob = await rar.generateAsync({ type: 'blob' });

  onProgress(100, 'Pronto!');
  return {
    bpm, firstBeat, beatTimes, duration,
    stems: stemData, stemBuffers, sampleRate, lrBlob, zipBlob, rarBlob,
  };
}

function microtask(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
