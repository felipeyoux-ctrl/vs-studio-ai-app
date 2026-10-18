import type { TrackKind } from '@/types';

type TrackState = {
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
  muted: boolean;
  soloed: boolean;
  volume: number;
  pan: number;
  kind: TrackKind;
};

export class AudioMixer {
  ctx: AudioContext;
  masterGain: GainNode;
  masterAnalyser: AnalyserNode;
  tracks: Map<TrackKind, TrackState> = new Map();
  isPlaying = false;
  startedAt = 0;
  pausedAt = 0;
  duration = 0;
  onTick?: (position: number) => void;
  private rafId: number | null = null;
  private anySolo = false;

  constructor() {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.9;
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
  }

  loadTracks(buffers: Record<TrackKind, AudioBuffer>, kinds: TrackKind[]): void {
    this.tracks.clear();
    let maxDur = 0;
    for (const kind of kinds) {
      const buf = buffers[kind];
      if (!buf) continue;
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 128;
      gain.connect(panner);
      panner.connect(analyser);
      analyser.connect(this.masterGain);
      this.tracks.set(kind, {
        buffer: buf,
        source: null,
        gain,
        panner,
        analyser,
        muted: false,
        soloed: false,
        volume: 0.8,
        pan: 0,
        kind,
      });
      if (buf.duration > maxDur) maxDur = buf.duration;
    }
    this.duration = maxDur;
  }

  play(): void {
    if (this.isPlaying || this.tracks.size === 0) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const offset = this.pausedAt % this.duration;
    this.startedAt = this.ctx.currentTime - offset;
    this.tracks.forEach((t) => {
      if (!t.buffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = t.buffer;
      src.connect(t.gain);
      src.start(0, offset);
      t.source = src;
    });
    this.isPlaying = true;
    this.tick();
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.pausedAt = this.ctx.currentTime - this.startedAt;
    this.stopSources();
    this.isPlaying = false;
    this.stopTick();
  }

  stop(): void {
    this.stopSources();
    this.isPlaying = false;
    this.pausedAt = 0;
    this.stopTick();
    this.onTick?.(0);
  }

  private stopSources() {
    this.tracks.forEach((t) => {
      if (t.source) {
        try { t.source.stop(); } catch {}
        t.source.disconnect();
        t.source = null;
      }
    });
  }

  private tick = () => {
    if (!this.isPlaying) return;
    const pos = (this.ctx.currentTime - this.startedAt) % this.duration;
    this.onTick?.(pos);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private stopTick() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  setVolume(kind: TrackKind, v: number) {
    const t = this.tracks.get(kind);
    if (!t) return;
    t.volume = v;
    this.applyGain(kind);
  }

  setMute(kind: TrackKind, muted: boolean) {
    const t = this.tracks.get(kind);
    if (!t) return;
    t.muted = muted;
    this.applyGain(kind);
  }

  setSolo(kind: TrackKind, soloed: boolean) {
    const t = this.tracks.get(kind);
    if (!t) return;
    t.soloed = soloed;
    this.anySolo = [...this.tracks.values()].some((tr) => tr.soloed);
    this.tracks.forEach((_, k) => this.applyGain(k));
  }

  setPan(kind: TrackKind, pan: number) {
    const t = this.tracks.get(kind);
    if (!t) return;
    t.pan = pan;
    t.panner.pan.setValueAtTime(pan, this.ctx.currentTime);
  }

  private applyGain(kind: TrackKind) {
    const t = this.tracks.get(kind);
    if (!t) return;
    const audible = t.muted ? false : this.anySolo ? t.soloed : true;
    const target = audible ? t.volume : 0;
    t.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.01);
  }

  getLevel(kind: TrackKind): number {
    const t = this.tracks.get(kind);
    if (!t) return 0;
    const data = new Uint8Array(t.analyser.frequencyBinCount);
    t.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length / 255;
  }

  getMasterLevel(): number {
    const data = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length / 255;
  }

  setMasterVolume(v: number) {
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  get position(): number {
    if (!this.isPlaying) return this.pausedAt % this.duration;
    return (this.ctx.currentTime - this.startedAt) % this.duration;
  }

  seek(seconds: number) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.stopSources();
    this.pausedAt = Math.max(0, Math.min(seconds, this.duration));
    if (wasPlaying) {
      this.isPlaying = false;
      this.play();
    }
  }
}
