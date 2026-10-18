import type { TrackKind } from '@/types';

export type RegenciaCommand = {
  id: string;
  bar: number;        // which bar (1-indexed) to trigger the command
  beat: number;       // which beat within the bar (0-indexed, 0=downbeat)
  text: string;       // the text to speak
  enabled: boolean;
  voice: string;      // 'male' | 'female' | 'neutral'
  rate: number;       // speech rate 0.5–2.0
  pitch: number;      // speech pitch 0–2
};

export const DEFAULT_COMMANDS: RegenciaCommand[] = [
  { id: 'c1', bar: 1, beat: 0, text: 'Introdução. Atenção músicos.', enabled: true,  voice: 'male', rate: 1.0, pitch: 1.0 },
  { id: 'c2', bar: 5, beat: 0, text: 'Entrada da voz.',             enabled: true,  voice: 'female', rate: 1.0, pitch: 1.1 },
  { id: 'c3', bar: 9, beat: 0, text: 'Refrão. Todos juntos.',       enabled: true,  voice: 'male', rate: 1.0, pitch: 1.0 },
  { id: 'c4', bar: 13, beat: 0, text: 'Segunda estrofe.',           enabled: true,  voice: 'female', rate: 1.0, pitch: 1.1 },
  { id: 'c5', bar: 17, beat: 0, text: 'Ponte. Mudança de tom.',     enabled: true,  voice: 'male', rate: 1.1, pitch: 0.9 },
  { id: 'c6', bar: 21, beat: 0, text: 'Refrão final. Com emoção.',  enabled: true,  voice: 'female', rate: 1.0, pitch: 1.2 },
  { id: 'c7', bar: 25, beat: 0, text: 'Coda. Finalizando.',         enabled: true,  voice: 'male', rate: 1.0, pitch: 1.0 },
];

export type RegenciaState = {
  commands: RegenciaCommand[];
  active: boolean;
  bpm: number;
  currentBar: number;
};

export function getBarAtTime(timeSec: number, bpm: number, firstBeat: number): number {
  if (bpm <= 0) return 0;
  const beatsPerBar = 4;
  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * beatsPerBar;
  if (timeSec < firstBeat) return 0;
  return Math.floor((timeSec - firstBeat) / barDuration) + 1;
}

export function getBeatInBar(timeSec: number, bpm: number, firstBeat: number): number {
  if (bpm <= 0) return 0;
  const beatDuration = 60 / bpm;
  const beatsPerBar = 4;
  if (timeSec < firstBeat) return 0;
  const elapsed = timeSec - firstBeat;
  const totalBeats = Math.floor(elapsed / beatDuration);
  return totalBeats % beatsPerBar;
}

// Find which commands should trigger at a given bar+beat that haven't been fired yet
export function getCommandsForPosition(
  commands: RegenciaCommand[],
  bar: number,
  beat: number,
  firedIds: Set<string>
): RegenciaCommand[] {
  return commands.filter((cmd) => {
    if (!cmd.enabled) return false;
    if (firedIds.has(cmd.id)) return false;
    return cmd.bar === bar && cmd.beat === beat;
  });
}

// Pick a speech synthesis voice based on preference
export function pickVoice(preference: string): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Try to find Portuguese voices first
  const ptVoices = voices.filter((v) => v.lang.startsWith('pt'));
  const pool = ptVoices.length > 0 ? ptVoices : voices;

  if (preference === 'female') {
    const female = pool.find((v) =>
      /female|feminino|maria|vitoria|luciana|ana/i.test(v.name)
    );
    if (female) return female;
    // Heuristic: even-indexed voices tend to be female in some systems
    return pool[0];
  }
  if (preference === 'male') {
    const male = pool.find((v) =>
      /male|masculino|joao|pedro|carlos|daniel|google.*portugues/i.test(v.name)
    );
    if (male) return male;
    return pool[Math.min(1, pool.length - 1)];
  }
  return pool[0];
}

export function speakCommand(cmd: RegenciaCommand): void {
  if (typeof speechSynthesis === 'undefined') return;
  const utterance = new SpeechSynthesisUtterance(cmd.text);
  const voice = pickVoice(cmd.voice);
  if (voice) utterance.voice = voice;
  utterance.rate = cmd.rate;
  utterance.pitch = cmd.pitch;
  utterance.lang = 'pt-BR';
  speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
}
