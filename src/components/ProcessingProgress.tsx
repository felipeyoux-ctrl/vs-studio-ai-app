import { Loader2 } from 'lucide-react';

type Props = {
  progress: number;
  status: string;
  bpm: number | null;
};

export function ProcessingProgress({ progress, status, bpm }: Props) {
  const steps = [
    { label: 'Decodificar', at: 5 },
    { label: 'BPM', at: 15 },
    { label: 'STFT', at: 25 },
    { label: 'HPSS', at: 35 },
    { label: 'Wiener', at: 55 },
    { label: 'Bleed', at: 68 },
    { label: 'Side', at: 78 },
    { label: 'Pronto', at: 100 },
  ];

  return (
    <div className="rounded-2xl bg-1 border border-c p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <Loader2 className="w-6 h-6 text-studio-accent spin-slow" />
        <h2 className="text-xl font-semibold text-0">Processando</h2>
        {bpm && (
          <span className="ml-auto px-3 py-1 rounded-full bg-studio-accent/15 text-studio-accent text-sm font-bold border border-studio-accent/30">
            {bpm} BPM
          </span>
        )}
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-1">{status}</span>
          <span className="text-0 font-mono font-bold">{progress}%</span>
        </div>
        <div className="relative h-3 bg-0 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-studio-accent-dim to-studio-accent rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
          <div className="absolute inset-0 shimmer" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-6">
        {steps.map((s) => {
          const done = progress >= s.at;
          const active = progress >= s.at - 15 && progress < s.at;
          return (
            <div
              key={s.label}
              className={[
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                done
                  ? 'bg-studio-green/15 border-studio-green/40 text-studio-green'
                  : active
                  ? 'bg-studio-accent/15 border-studio-accent/40 text-studio-accent'
                  : 'bg-2 border-c text-2',
              ].join(' ')}
            >
              {s.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
