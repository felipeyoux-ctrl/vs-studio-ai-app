import { useEffect, useRef, useState, useCallback } from 'react';
import { Piano, PlayCircle, StopCircle, Zap } from 'lucide-react';
import type { TrackKind } from '@/types';
import { TRACK_ORDER } from '@/types';
import type { AudioMixer } from '@/lib/audioEngine';

type Props = {
  mixer: AudioMixer;
  bpm: number;
};

// Keyboard mapping: 12 semitones across the keyboard row
const KEY_MAP: { key: string; semitone: number; label: string }[] = [
  { key: 'a', semitone: 0,  label: 'C' },
  { key: 'w', semitone: 1,  label: 'C#' },
  { key: 's', semitone: 2,  label: 'D' },
  { key: 'e', semitone: 3,  label: 'D#' },
  { key: 'd', semitone: 4,  label: 'E' },
  { key: 'f', semitone: 5,  label: 'F' },
  { key: 't', semitone: 6,  label: 'F#' },
  { key: 'g', semitone: 7,  label: 'G' },
  { key: 'y', semitone: 8,  label: 'G#' },
  { key: 'h', semitone: 9,  label: 'A' },
  { key: 'u', semitone: 10, label: 'A#' },
  { key: 'j', semitone: 11, label: 'B' },
];

const PLAYBACK_RATES: number[] = KEY_MAP.map((k) => Math.pow(2, k.semitone / 12));

export function SamplerPanel({ mixer, bpm }: Props) {
  const [selectedKind, setSelectedKind] = useState<TrackKind>('voz');
  const [octave, setOctave] = useState(4);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [activePads, setActivePads] = useState<Set<number>>(new Set());
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) ctxRef.current = mixer.ctx;
    return ctxRef.current;
  }, [mixer]);

  const getBuffer = useCallback((kind: TrackKind): AudioBuffer | null => {
    const track = mixer.tracks.get(kind);
    return track?.buffer ?? null;
  }, [mixer]);

  const playNote = useCallback((semitone: number) => {
    const ctx = getCtx();
    const buffer = getBuffer(selectedKind);
    if (!buffer) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = PLAYBACK_RATES[semitone] ?? 1;

    const gain = ctx.createGain();
    gain.gain.value = 0.85;
    // Quick fade out after 3 seconds max
    gain.gain.setValueAtTime(0.85, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3);

    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(0);
    src.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== src);
    };
    activeSourcesRef.current.push(src);
  }, [getCtx, getBuffer, selectedKind]);

  const stopAll = useCallback(() => {
    activeSourcesRef.current.forEach((s) => {
      try { s.stop(); } catch {}
    });
    activeSourcesRef.current = [];
    setActiveKeys(new Set());
    setActivePads(new Set());
  }, []);

  // Keyboard input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      const idx = KEY_MAP.findIndex((k) => k.key === key);
      if (idx >= 0) {
        e.preventDefault();
        playNote(idx);
        setActiveKeys((prev) => new Set(prev).add(key));
      }
      if (key === 'escape') stopAll();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [playNote, stopAll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeSourcesRef.current.forEach((s) => { try { s.stop(); } catch {} });
    };
  }, []);

  const availableStems = TRACK_ORDER.filter((t) => mixer.tracks.has(t.id));

  const handlePadClick = (idx: number) => {
    playNote(idx);
    setActivePads((prev) => new Set(prev).add(idx));
    setTimeout(() => {
      setActivePads((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }, 200);
  };

  return (
    <div className="rounded-2xl bg-1 border border-c overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-c bg-0/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-2 flex items-center justify-center text-studio-cyan">
            <Piano className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-0 font-semibold text-sm">Sampler por Instrumento</h3>
            <p className="text-2 text-xs">Toque o stem isolado no teclado, com pitch shift</p>
          </div>
        </div>
        <button
          onClick={stopAll}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-2 border border-c text-1 hover:text-0 hover:bg-3 transition text-sm"
        >
          <StopCircle className="w-4 h-4" /> Parar
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Instrument selector */}
        <div>
          <label className="text-[10px] text-2 uppercase tracking-wide mb-2 block">Instrumento</label>
          <div className="flex flex-wrap gap-2">
            {availableStems.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedKind(t.id)}
                className={[
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  selectedKind === t.id
                    ? t.group === 'guia'
                      ? 'bg-studio-accent text-0'
                      : 'bg-studio-cyan text-0'
                    : 'bg-2 text-1 border border-c hover:text-0 hover:bg-3',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Octave selector */}
        <div className="flex items-center gap-3">
          <label className="text-[10px] text-2 uppercase tracking-wide">Oitava</label>
          <div className="flex gap-1">
            {[2, 3, 4, 5].map((o) => (
              <button
                key={o}
                onClick={() => setOctave(o)}
                className={[
                  'w-8 h-8 rounded text-sm font-mono transition',
                  octave === o ? 'bg-studio-cyan text-0' : 'bg-2 text-1 hover:bg-3',
                ].join(' ')}
              >
                {o}
              </button>
            ))}
          </div>
          <span className="text-2 text-xs ml-2">
            Nota base: C{octave}
          </span>
        </div>

        {/* Keyboard / pads */}
        <div className="flex gap-1 pt-2">
          {KEY_MAP.map((k, idx) => {
            const isBlack = k.label.includes('#');
            const isActive = activeKeys.has(k.key) || activePads.has(idx);
            return (
              <button
                key={k.key}
                onMouseDown={() => handlePadClick(idx)}
                className={[
                  'relative flex flex-col items-center justify-end pb-2 rounded-b-lg transition-all select-none',
                  isBlack ? 'w-8 h-24 bg-3 border border-c' : 'w-10 h-32 bg-2 border border-c',
                  isActive && (isBlack ? 'bg-studio-cyan text-0' : 'bg-studio-cyan/70 text-0'),
                  !isActive && 'hover:bg-3',
                ].join(' ')}
                title={`${k.label}${octave} (tecla ${k.key.toUpperCase()})`}
              >
                <span className={[
                  'text-[10px] font-mono',
                  isBlack ? 'text-1' : 'text-2',
                  isActive && 'text-0',
                ].join(' ')}>
                  {k.label}{octave}
                </span>
                <span className={[
                  'text-[8px] mt-0.5 font-mono',
                  isBlack ? 'text-2' : 'text-3',
                  isActive && 'text-0',
                ].join(' ')}>
                  {k.key.toUpperCase()}
                </span>
                {isActive && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-studio-cyan">
                    <div className="absolute inset-0 rounded-full bg-studio-cyan animate-ping" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Info */}
        <div className="flex items-center gap-2 text-2 text-xs">
          <Zap className="w-3.5 h-3.5 text-studio-accent" />
          <span>
            Use o teclado (A–J) ou clique nas teclas. ESC para parar.
            Cada nota toca o stem de "{TRACK_ORDER.find((t) => t.id === selectedKind)?.label}" com pitch shift.
          </span>
        </div>
      </div>
    </div>
  );
}
