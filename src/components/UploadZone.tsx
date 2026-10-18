import { useCallback, useRef, useState } from 'react';
import { UploadCloud, Music4, X } from 'lucide-react';

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
  selectedFileName?: string;
  uploadPct?: number;
  onClear?: () => void;
};

export function UploadZone({ onFile, disabled, selectedFileName, uploadPct, onClear }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile, disabled]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={[
        'relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300',
        'px-8 py-14 text-center select-none',
        dragging ? 'border-studio-accent bg-studio-accent/5 scale-[1.01]' : 'border-c bg-1/40 hover:border-studio-accent/50 hover:bg-1/70',
        disabled ? 'opacity-50 pointer-events-none' : '',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.flac,.aac,.ogg,.m4a"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      {uploadPct !== undefined && uploadPct < 100 ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full border-2 border-studio-accent border-t-transparent spin-slow" />
          <p className="text-0 font-medium">Enviando arquivo… {uploadPct}%</p>
          <div className="w-full max-w-xs h-2 bg-0 rounded-full overflow-hidden">
            <div className="h-full bg-studio-accent transition-all duration-200" style={{ width: `${uploadPct}%` }} />
          </div>
        </div>
      ) : selectedFileName ? (
        <div className="flex items-center justify-center gap-3">
          <Music4 className="w-6 h-6 text-studio-accent" />
          <span className="text-0 font-medium truncate max-w-xs">{selectedFileName}</span>
          {onClear && (
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="ml-2 p-1 rounded-lg hover:bg-3 text-1 hover:text-0 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-2 flex items-center justify-center pulse-ring">
            <UploadCloud className="w-7 h-7 text-studio-accent" />
          </div>
          <div>
            <p className="text-0 text-lg font-semibold">Arraste seu áudio aqui</p>
            <p className="text-2 text-sm mt-1">WAV, MP3, FLAC, AAC, OGG · clique para escolher</p>
          </div>
        </div>
      )}
    </div>
  );
}
