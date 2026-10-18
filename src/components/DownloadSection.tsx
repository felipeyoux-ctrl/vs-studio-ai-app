import { Download, FileAudio, Archive, FileBox } from 'lucide-react';

type Props = {
  lrBlob: Blob;
  zipBlob: Blob;
  rarBlob: Blob;
  bpm: number | null;
};

function Card({
  icon,
  title,
  desc,
  ext,
  blob,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  ext: string;
  blob: Blob;
}) {
  const url = URL.createObjectURL(blob);
  const filename = title.replace(/\s+/g, '_');
  return (
    <a
      href={url}
      download={`${filename}.${ext.toLowerCase()}`}
      className="group flex items-center gap-4 rounded-xl bg-1 border border-c p-4 hover:border-studio-accent/50 hover:bg-2 transition-all duration-200"
    >
      <div className="w-12 h-12 rounded-lg bg-2 flex items-center justify-center text-studio-accent group-hover:bg-studio-accent group-hover:text-0 transition-colors">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-0 font-semibold text-sm">{title}</p>
        <p className="text-2 text-xs mt-0.5">{desc}</p>
      </div>
      <span className="text-2 text-xs font-mono uppercase mr-2">{ext}</span>
      <Download className="w-5 h-5 text-2 group-hover:text-studio-accent transition-colors" />
    </a>
  );
}

export function DownloadSection({ lrBlob, zipBlob, rarBlob, bpm }: Props) {
  const bpmLabel = bpm ? `${bpm} BPM` : '';
  return (
    <div className="rounded-2xl bg-1 border border-c p-6 sm:p-8">
      <h2 className="text-xl font-semibold text-0 mb-1">Downloads</h2>
      <p className="text-2 text-sm mb-5">Pacotes prontos — clique para baixar.</p>
      <div className="grid gap-3">
        <Card
          icon={<FileAudio className="w-6 h-6" />}
          title={`LR Estéreo ${bpmLabel}`}
          desc="Mix L=Ritmo · R=Banda — arquivo único"
          ext="WAV"
          blob={lrBlob}
        />
        <Card
          icon={<Archive className="w-6 h-6" />}
          title={`11 Pistas ${bpmLabel}`}
          desc="Cada stem isolado em WAV individual"
          ext="ZIP"
          blob={zipBlob}
        />
        <Card
          icon={<FileBox className="w-6 h-6" />}
          title={`Pacote Completo ${bpmLabel}`}
          desc="24 arquivos: Studio + Original + LR"
          ext="RAR"
          blob={rarBlob}
        />
      </div>
    </div>
  );
}
