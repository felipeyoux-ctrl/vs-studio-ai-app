import { useEffect, useRef, useState } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Headphones, Download, Mic, Piano,
} from 'lucide-react';
import type { TrackKind } from '@/types';
import type { AudioMixer } from '@/lib/audioEngine';
import { drawWaveform } from '@/lib/waveform';

type Props = {
  kind: TrackKind;
  label: string;
  group: 'guia' | 'banda';
  icon: React.ReactNode;
  color: string;
  mixer: AudioMixer;
  data: Float32Array;
  position: number;
  duration: number;
  onDownload: () => void;
  onSolo: () => void;
  onOpenSampler: () => void;
  onOpenRegencia?: () => void;
};

export function TrackCard({
  kind, label, group, icon, color, mixer, data, position, duration,
  onDownload, onSolo, onOpenSampler, onOpenRegencia,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [soloed, setSoloed] = useState(false);
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number>(0);
  const prevSoloedRef = useRef(false);

  // Level meter
  useEffect(() => {
    const read = () => {
      setLevel(mixer.getLevel(kind));
      rafRef.current = requestAnimationFrame(read);
    };
    rafRef.current = requestAnimationFrame(read);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mixer, kind]);

  // Redraw waveform when position changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const progress = duration > 0 ? position / duration : 0;
    drawWaveform(canvas, data, color, progress);
  }, [data, color, position, duration]);

  const onVol = (v: number) => {
    setVolume(v);
    mixer.setVolume(kind, v);
    if (v > 0 && muted) {
      setMuted(false);
      mixer.setMute(kind, false);
    }
  };

  const onMute = () => {
    const m = !muted;
    setMuted(m);
    mixer.setMute(kind, m);
  };

  const onSoloToggle = () => {
    const s = !soloed;
    setSoloed(s);
    mixer.setSolo(kind, s);
    onSolo();
  };

  const isGuia = group === 'guia';
  const progress = duration > 0 ? position / duration : 0;

  return (
    <div
      className={[
        'rounded-xl border transition-all duration-200 overflow-hidden',
        soloed
          ? 'border-studio-accent/60 bg-studio-accent/5'
          : isGuia
          ? 'border-studio-accent/20 bg-studio-accent/[0.03]'
          : 'border-c bg-1',
      ].join(' ')}
    >
      <div className="flex items-stretch gap-3 p-3">
        {/* Color stripe + icon */}
        <div
          className="w-1 rounded-full shrink-0"
          style={{ background: color }}
        />
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: color + '20', color }}
        >
          {icon}
        </div>

        {/* Label + waveform */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-0 text-sm font-semibold truncate">{label}</span>
            <div className="flex items-center gap-1.5">
              {/* Level meter */}
              <div className="w-16 h-1.5 bg-0 rounded-full overflow-hidden">
                <div
                  className="h-full transition-[width] duration-75 rounded-full"
                  style={{
                    width: `${Math.min(100, level * 120)}%`,
                    background: `linear-gradient(to right, ${color}, ${color}aa)`,
                  }}
                />
              </div>
              {/* Actions */}
              <button
                onClick={onMute}
                className={[
                  'p-1.5 rounded transition',
                  muted ? 'bg-studio-red/20 text-studio-red' : 'text-2 hover:text-0 hover:bg-3',
                ].join(' ')}
                title="Mute"
              >
                {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={onSoloToggle}
                className={[
                  'p-1.5 rounded transition',
                  soloed ? 'bg-studio-accent text-0' : 'text-2 hover:text-studio-accent hover:bg-3',
                ].join(' ')}
                title="Solo"
              >
                <Headphones className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDownload}
                className="p-1.5 rounded text-2 hover:text-0 hover:bg-3 transition"
                title="Baixar pista"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onOpenSampler}
                className="p-1.5 rounded text-2 hover:text-studio-cyan hover:bg-3 transition"
                title="Tocar como sampler"
              >
                <Piano className="w-3.5 h-3.5" />
              </button>
              {onOpenRegencia && (
                <button
                  onClick={onOpenRegencia}
                  className="p-1.5 rounded text-2 hover:text-studio-accent hover:bg-3 transition"
                  title="Regência"
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Waveform canvas */}
          <div className="relative h-12 rounded-md bg-0/60 overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
            />
            {muted && (
              <div className="absolute inset-0 bg-0/50 flex items-center justify-center">
                <span className="text-2 text-[10px] uppercase tracking-wide">Mudo</span>
              </div>
            )}
          </div>

          {/* Volume slider */}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => onVol(parseFloat(e.target.value))}
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${color} ${volume * 100}%, var(--bg-3) ${volume * 100}%)`,
              }}
            />
            <span className="text-2 text-[10px] font-mono w-7 text-right">{Math.round(volume * 100)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
