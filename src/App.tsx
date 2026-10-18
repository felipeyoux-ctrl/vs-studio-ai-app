import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, Square, Volume2, Disc3, AlertCircle, Github,
  Download, Mic, Piano, Clock, Mic2, Megaphone, Users, Wind,
  Guitar, Drum, AudioWaveform, Waves,
} from 'lucide-react';
import { UploadZone } from '@/components/UploadZone';
import { ProcessingProgress } from '@/components/ProcessingProgress';
import { DownloadSection } from '@/components/DownloadSection';
import { RegenciaPanel } from '@/components/RegenciaPanel';
import { SamplerPanel } from '@/components/SamplerPanel';
import { TrackCard } from '@/components/TrackCard';
import { processAudio, type ProcessResult } from '@/lib/audioProcessor';
import { AudioMixer } from '@/lib/audioEngine';
import { audioBufferToWav } from '@/lib/wavEncoder';
import type { TrackKind } from '@/types';
import { TRACK_ORDER, getTrackMeta } from '@/types';
import {
  DEFAULT_COMMANDS, getBarAtTime, getBeatInBar, getCommandsForPosition,
  speakCommand, stopSpeaking, type RegenciaCommand,
} from '@/lib/regencia';

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';
type Panel = 'none' | 'sampler' | 'regencia' | 'downloads';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Clock, Mic2, Megaphone, Mic, Users, Wind, Piano, Guitar, Drum, AudioWaveform, Waves,
};

function formatTime(s: number): string {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState<string>();
  const [uploadPct, setUploadPct] = useState<number>();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Na fila…');
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string>();
  const mixerRef = useRef<AudioMixer | null>(null);
  const [mixerReady, setMixerReady] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(false);

  // Playback state
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [master, setMaster] = useState(0.9);

  // Panel state
  const [openPanel, setOpenPanel] = useState<Panel>('none');
  const [samplerKind, setSamplerKind] = useState<TrackKind>('voz');

  // Regência state
  const [commands, setCommands] = useState<RegenciaCommand[]>(DEFAULT_COMMANDS);
  const [regenciaActive, setRegenciaActive] = useState(false);
  const [currentBar, setCurrentBar] = useState(0);
  const firedIdsRef = useRef<Set<string>>(new Set());
  const lastBarRef = useRef(0);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setError(undefined);
    setMixerReady(false);
    setResult(null);
    setPhase('uploading');
    setUploadPct(0);

    let upPct = 0;
    const upInterval = setInterval(() => {
      upPct = Math.min(95, upPct + Math.random() * 15);
      setUploadPct(Math.round(upPct));
    }, 120);

    try {
      await new Promise((r) => setTimeout(r, 400));
      clearInterval(upInterval);
      setUploadPct(100);
      setPhase('processing');
      setProgress(0);
      setStatus('Iniciando…');

      const res = await processAudio(file, (p, s) => {
        setProgress(p);
        setStatus(s);
      });
      setResult(res);
      setPhase('done');
    } catch (e) {
      clearInterval(upInterval);
      setPhase('error');
      setError(e instanceof Error ? e.message : 'Falha ao processar o áudio');
    }
  }, []);

  // Load stems into mixer when processing is done
  useEffect(() => {
    if (phase !== 'done' || !result) return;
    setLoadingTracks(true);
    try {
      if (!mixerRef.current) mixerRef.current = new AudioMixer();
      const kinds = TRACK_ORDER.map((t) => t.id).filter((k) => result.stemBuffers[k]);
      mixerRef.current.loadTracks(result.stemBuffers, kinds as TrackKind[]);

      mixerRef.current.onTick = (p) => setPosition(p);

      setMixerReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o mixer');
    } finally {
      setLoadingTracks(false);
    }
  }, [phase, result]);

  // Regência: fire voice commands at the right bar/beat
  useEffect(() => {
    if (!regenciaActive || !mixerRef.current || !result) return;
    let raf: number;
    const tick = () => {
      const pos = mixerRef.current!.position;
      const bar = getBarAtTime(pos, result.bpm, result.firstBeat);
      const beat = getBeatInBar(pos, result.bpm, result.firstBeat);
      if (bar !== lastBarRef.current) {
        setCurrentBar(bar);
        lastBarRef.current = bar;
      }
      const toFire = getCommandsForPosition(commands, bar, beat, firedIdsRef.current);
      for (const cmd of toFire) {
        speakCommand(cmd);
        firedIdsRef.current.add(cmd.id);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [regenciaActive, result, commands]);

  const toggleRegencia = () => {
    if (regenciaActive) {
      stopSpeaking();
      setRegenciaActive(false);
    } else {
      firedIdsRef.current = new Set();
      lastBarRef.current = 0;
      setRegenciaActive(true);
    }
  };

  const onPlay = () => {
    if (!mixerRef.current) return;
    if (playing) {
      mixerRef.current.pause();
      setPlaying(false);
    } else {
      mixerRef.current.play();
      setPlaying(true);
    }
  };

  const onStop = () => {
    mixerRef.current?.stop();
    setPlaying(false);
    setPosition(0);
  };

  const onMaster = (v: number) => {
    setMaster(v);
    mixerRef.current?.setMasterVolume(v);
  };

  const downloadStem = (kind: TrackKind) => {
    if (!result) return;
    const buf = result.stemBuffers[kind];
    if (!buf) return;
    const blob = audioBufferToWav(buf);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    mixerRef.current?.stop();
    mixerRef.current = null;
    setMixerReady(false);
    setResult(null);
    setFileName(undefined);
    setUploadPct(undefined);
    setProgress(0);
    setStatus('Na fila…');
    setError(undefined);
    setPlaying(false);
    setPosition(0);
    setRegenciaActive(false);
    stopSpeaking();
    firedIdsRef.current = new Set();
    setOpenPanel('none');
    setPhase('idle');
  };

  const bpm = result?.bpm ?? null;
  const duration = mixerRef.current?.duration ?? result?.duration ?? 0;

  const guiaTracks = TRACK_ORDER.filter((t) => t.group === 'guia');
  const bandaTracks = TRACK_ORDER.filter((t) => t.group === 'banda');

  return (
    <div className="min-h-screen bg-0 text-0">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-studio-accent/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-studio-cyan/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-studio-accent to-studio-accent-dim flex items-center justify-center shadow-lg shadow-studio-accent/20">
              <Disc3 className="w-6 h-6 text-0" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Tonton Studios</h1>
              <p className="text-2 text-xs">Separação de instrumentos · HPSS + Wiener masking</p>
            </div>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="p-2 rounded-lg bg-1 border border-c text-1 hover:text-0 hover:bg-2 transition"
          >
            <Github className="w-5 h-5" />
          </a>
        </header>

        {/* Upload */}
        {(phase === 'idle' || phase === 'uploading') && (
          <UploadZone
            onFile={handleFile}
            disabled={phase === 'uploading'}
            selectedFileName={fileName}
            uploadPct={uploadPct}
            onClear={phase === 'uploading' ? undefined : reset}
          />
        )}

        {/* Processing */}
        {phase === 'processing' && (
          <div className="space-y-6">
            <ProcessingProgress progress={progress} status={status} bpm={bpm} />
            <button
              onClick={reset}
              className="text-2 text-sm hover:text-0 transition underline underline-offset-4"
            >
              Cancelar e voltar
            </button>
          </div>
        )}

        {/* Done — Moises-style track view */}
        {phase === 'done' && result && mixerReady && mixerRef.current && (
          <div className="space-y-5">
            {/* File info bar */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-2 flex items-center justify-center">
                  <Waves className="w-5 h-5 text-studio-accent" />
                </div>
                <div>
                  <p className="text-0 font-semibold text-sm">{fileName}</p>
                  <p className="text-2 text-xs">
                    {bpm} BPM · {result.beatTimes.length} beats · {formatTime(duration)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOpenPanel(openPanel === 'sampler' ? 'none' : 'sampler')}
                  className={[
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition',
                    openPanel === 'sampler'
                      ? 'bg-studio-cyan text-0'
                      : 'bg-1 border border-c text-1 hover:text-0 hover:bg-2',
                  ].join(' ')}
                >
                  <Piano className="w-4 h-4" /> Sampler
                </button>
                <button
                  onClick={() => setOpenPanel(openPanel === 'regencia' ? 'none' : 'regencia')}
                  className={[
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition',
                    openPanel === 'regencia' || regenciaActive
                      ? 'bg-studio-accent text-0'
                      : 'bg-1 border border-c text-1 hover:text-0 hover:bg-2',
                  ].join(' ')}
                >
                  <Mic className="w-4 h-4" /> Regência
                </button>
                <button
                  onClick={() => setOpenPanel(openPanel === 'downloads' ? 'none' : 'downloads')}
                  className={[
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition',
                    openPanel === 'downloads'
                      ? 'bg-studio-green text-0'
                      : 'bg-1 border border-c text-1 hover:text-0 hover:bg-2',
                  ].join(' ')}
                >
                  <Download className="w-4 h-4" /> Downloads
                </button>
                <button
                  onClick={reset}
                  className="px-3 py-2 rounded-lg bg-1 border border-c text-1 hover:text-0 hover:bg-2 transition text-sm font-medium"
                >
                  Novo
                </button>
              </div>
            </div>

            {/* Transport bar */}
            <div className="sticky top-0 z-10 rounded-xl bg-1 border border-c px-4 py-3 flex items-center gap-4 glass">
              <button
                onClick={onPlay}
                className="w-11 h-11 rounded-full bg-studio-accent text-0 flex items-center justify-center hover:brightness-110 active:scale-95 transition shadow-lg shadow-studio-accent/20 shrink-0"
              >
                {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <button
                onClick={onStop}
                className="w-9 h-9 rounded-full bg-3 text-1 flex items-center justify-center hover:text-0 hover:bg-studio-red/60 transition shrink-0"
              >
                <Square className="w-4 h-4" />
              </button>

              <span className="text-1 font-mono text-sm tabular-nums shrink-0">
                {formatTime(position)} / {formatTime(duration)}
              </span>

              {/* Progress bar */}
              <div
                className="flex-1 h-1.5 bg-0 rounded-full overflow-hidden cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  mixerRef.current?.seek(pct * duration);
                }}
              >
                <div
                  className="h-full bg-gradient-to-r from-studio-accent-dim to-studio-accent transition-[width] duration-100"
                  style={{ width: `${duration > 0 ? (position / duration) * 100 : 0}%` }}
                />
              </div>

              {bpm && (
                <span className="px-3 py-1 rounded-full bg-studio-accent/15 text-studio-accent text-sm font-bold border border-studio-accent/30 shrink-0">
                  {bpm} BPM
                </span>
              )}

              {/* Master volume */}
              <div className="flex items-center gap-2 shrink-0">
                <Volume2 className="w-4 h-4 text-2" />
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={master}
                  onChange={(e) => onMaster(parseFloat(e.target.value))}
                  className="w-20 h-1 rounded-full appearance-none cursor-pointer accent-studio-accent"
                />
              </div>
            </div>

            {/* Sampler panel (collapsible) */}
            {openPanel === 'sampler' && (
              <SamplerPanel mixer={mixerRef.current} bpm={bpm ?? 120} />
            )}

            {/* Regência panel (collapsible) */}
            {openPanel === 'regencia' && (
              <RegenciaPanel
                commands={commands}
                onChange={setCommands}
                active={regenciaActive}
                onToggleActive={toggleRegencia}
                bpm={bpm ?? 120}
                currentBar={currentBar}
              />
            )}

            {/* Downloads panel (collapsible) */}
            {openPanel === 'downloads' && (
              <DownloadSection
                lrBlob={result.lrBlob}
                zipBlob={result.zipBlob}
                rarBlob={result.rarBlob}
                bpm={bpm}
              />
            )}

            {/* Track list */}
            <div className="space-y-4">
              {/* Guia group */}
              <div>
                <h3 className="text-2 text-xs font-semibold uppercase tracking-wide mb-2 px-1">
                  Guia & Regência
                </h3>
                <div className="grid gap-2">
                  {guiaTracks.map((t) => {
                    const Icon = ICONS[t.icon] ?? Waves;
                    return (
                      <TrackCard
                        key={t.id}
                        kind={t.id}
                        label={t.label}
                        group={t.group}
                        icon={<Icon className="w-5 h-5" />}
                        color={t.color}
                        mixer={mixerRef.current!}
                        data={result.stems[t.id]}
                        position={position}
                        duration={duration}
                        onDownload={() => downloadStem(t.id)}
                        onSolo={() => {}}
                        onOpenSampler={() => { setSamplerKind(t.id); setOpenPanel('sampler'); }}
                        onOpenRegencia={t.id === 'regencia' ? () => setOpenPanel('regencia') : undefined}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Banda group */}
              <div>
                <h3 className="text-2 text-xs font-semibold uppercase tracking-wide mb-2 px-1">
                  Banda
                </h3>
                <div className="grid gap-2">
                  {bandaTracks.map((t) => {
                    const Icon = ICONS[t.icon] ?? Waves;
                    return (
                      <TrackCard
                        key={t.id}
                        kind={t.id}
                        label={t.label}
                        group={t.group}
                        icon={<Icon className="w-5 h-5" />}
                        color={t.color}
                        mixer={mixerRef.current!}
                        data={result.stems[t.id]}
                        position={position}
                        duration={duration}
                        onDownload={() => downloadStem(t.id)}
                        onSolo={() => {}}
                        onOpenSampler={() => { setSamplerKind(t.id); setOpenPanel('sampler'); }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading tracks */}
        {phase === 'done' && loadingTracks && (
          <div className="rounded-2xl bg-1 border border-c p-12 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-studio-accent border-t-transparent spin-slow" />
            <p className="text-1 text-sm">Carregando pistas…</p>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="rounded-2xl bg-studio-red/10 border border-studio-red/30 p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-studio-red shrink-0 mt-0.5" />
              <div>
                <h2 className="text-0 font-semibold mb-1">Algo deu errado</h2>
                <p className="text-1 text-sm">{error ?? 'Erro desconhecido'}</p>
                <button
                  onClick={reset}
                  className="mt-4 px-4 py-2 rounded-lg bg-1 border border-c text-0 hover:bg-2 transition text-sm font-medium"
                >
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-16 pt-6 border-t border-c text-center">
          <p className="text-2 text-xs">
            Tonton Studios · HPSS + Wiener masking · 100% no navegador
          </p>
        </footer>
      </div>
    </div>
  );
}
