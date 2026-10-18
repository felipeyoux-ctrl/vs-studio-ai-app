export type TrackKind =
  | 'click'
  | 'guia'
  | 'regencia'
  | 'voz'
  | 'backings'
  | 'sanfona'
  | 'teclado'
  | 'guitarra'
  | 'bateria'
  | 'baixo'
  | 'metais';

export type TrackMeta = {
  id: TrackKind;
  label: string;
  group: 'guia' | 'banda';
  color: string;
  icon: string; // lucide icon name
};

export const TRACK_ORDER: TrackMeta[] = [
  { id: 'click',    label: 'Click',    group: 'guia',  color: '#f59e0b', icon: 'Clock' },
  { id: 'guia',     label: 'Guia',     group: 'guia',  color: '#fbbf24', icon: 'Mic2' },
  { id: 'regencia', label: 'Regência', group: 'guia',  color: '#f97316', icon: 'Megaphone' },
  { id: 'voz',      label: 'Voz',      group: 'banda', color: '#06b6d4', icon: 'Mic' },
  { id: 'backings', label: 'Backings', group: 'banda', color: '#0ea5e9', icon: 'Users' },
  { id: 'sanfona',  label: 'Sanfona',  group: 'banda', color: '#10b981', icon: 'Wind' },
  { id: 'teclado',  label: 'Teclado',  group: 'banda', color: '#8b5cf6', icon: 'Piano' },
  { id: 'guitarra', label: 'Guitarra', group: 'banda', color: '#ef4444', icon: 'Guitar' },
  { id: 'bateria',  label: 'Bateria',  group: 'banda', color: '#f43f5e', icon: 'Drum' },
  { id: 'baixo',    label: 'Baixo',    group: 'banda', color: '#3b82f6', icon: 'AudioWaveform' },
  { id: 'metais',   label: 'Metais',   group: 'banda', color: '#eab308', icon: 'Trumpet' },
];

export function getTrackMeta(kind: TrackKind): TrackMeta | undefined {
  return TRACK_ORDER.find((t) => t.id === kind);
}
