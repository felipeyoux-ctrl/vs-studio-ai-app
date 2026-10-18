import { useState } from 'react';
import {
  Mic, MicOff, Plus, Trash2, GripVertical, Volume2, Play, Square,
} from 'lucide-react';
import type { RegenciaCommand } from '@/lib/regencia';
import { speakCommand, stopSpeaking } from '@/lib/regencia';

type Props = {
  commands: RegenciaCommand[];
  onChange: (commands: RegenciaCommand[]) => void;
  active: boolean;
  onToggleActive: () => void;
  bpm: number;
  currentBar: number;
};

export function RegenciaPanel({
  commands,
  onChange,
  active,
  onToggleActive,
  bpm,
  currentBar,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<RegenciaCommand>) => {
    onChange(commands.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const remove = (id: string) => {
    onChange(commands.filter((c) => c.id !== id));
  };

  const add = () => {
    const newCmd: RegenciaCommand = {
      id: `cmd_${Date.now()}`,
      bar: Math.max(1, Math.max(...commands.map((c) => c.bar)) + 4),
      beat: 0,
      text: 'Novo comando',
      enabled: true,
      voice: 'male',
      rate: 1.0,
      pitch: 1.0,
    };
    onChange([...commands, newCmd]);
    setEditingId(newCmd.id);
  };

  const preview = (cmd: RegenciaCommand) => {
    stopSpeaking();
    speakCommand(cmd);
  };

  return (
    <div className="rounded-2xl bg-1 border border-c overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-c bg-0/40">
        <div className="flex items-center gap-3">
          <div className={[
            'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
            active ? 'bg-studio-accent/20 text-studio-accent' : 'bg-2 text-2',
          ].join(' ')}>
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-0 font-semibold text-sm">Regência com Voz IA</h3>
            <p className="text-2 text-xs">Comandos falados sincronizados com a música</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {active && (
            <span className="text-studio-accent text-xs font-mono px-2 py-1 rounded bg-studio-accent/10">
              Barra {currentBar}
            </span>
          )}
          <button
            onClick={onToggleActive}
            className={[
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              active
                ? 'bg-studio-red/20 text-studio-red border border-studio-red/40 hover:bg-studio-red/30'
                : 'bg-studio-accent text-0 hover:brightness-110 shadow-lg shadow-studio-accent/20',
            ].join(' ')}
          >
            {active ? <><MicOff className="w-4 h-4" /> Desativar</> : <><Mic className="w-4 h-4" /> Ativar Regência</>}
          </button>
        </div>
      </div>

      {/* Command list */}
      <div className="max-h-[420px] overflow-y-auto">
        {commands.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-2 text-sm">Nenhum comando ainda. Clique em adicionar.</p>
          </div>
        )}
        {commands.sort((a, b) => a.bar - b.bar || a.beat - b.beat).map((cmd) => (
          <div
            key={cmd.id}
            className={[
              'flex items-start gap-3 px-5 py-3 border-b border-c/50 transition-colors',
              !cmd.enabled ? 'opacity-40' : '',
              currentBar === cmd.bar && active ? 'bg-studio-accent/5' : '',
            ].join(' ')}
          >
            <GripVertical className="w-4 h-4 text-3 mt-1 shrink-0" />

            {/* Bar + beat */}
            <div className="flex flex-col gap-1 shrink-0 w-20">
              <label className="text-[9px] text-2 uppercase">Barra</label>
              <input
                type="number"
                min={1}
                value={cmd.bar}
                onChange={(e) => update(cmd.id, { bar: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-full bg-2 border border-c rounded px-2 py-1 text-0 text-sm font-mono text-center"
              />
              <label className="text-[9px] text-2 uppercase mt-1">Beat</label>
              <select
                value={cmd.beat}
                onChange={(e) => update(cmd.id, { beat: parseInt(e.target.value) })}
                className="w-full bg-2 border border-c rounded px-1 py-1 text-0 text-xs"
              >
                <option value={0}>1</option>
                <option value={1}>2</option>
                <option value={2}>3</option>
                <option value={3}>4</option>
              </select>
            </div>

            {/* Text + voice settings */}
            <div className="flex-1 min-w-0">
              {editingId === cmd.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={cmd.text}
                    autoFocus
                    onChange={(e) => update(cmd.id, { text: e.target.value })}
                    onBlur={() => setEditingId(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingId(null); }}
                    className="w-full bg-2 border border-studio-accent/40 rounded px-3 py-1.5 text-0 text-sm"
                    placeholder="Comando falado…"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={cmd.voice}
                      onChange={(e) => update(cmd.id, { voice: e.target.value })}
                      className="bg-2 border border-c rounded px-2 py-1 text-0 text-xs"
                    >
                      <option value="male">Voz masculina</option>
                      <option value="female">Voz feminina</option>
                      <option value="neutral">Voz neutra</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-2">VEL</span>
                      <input
                        type="range" min={0.5} max={2} step={0.1}
                        value={cmd.rate}
                        onChange={(e) => update(cmd.id, { rate: parseFloat(e.target.value) })}
                        className="w-16 accent-studio-accent"
                      />
                      <span className="text-[9px] text-2 font-mono w-6">{cmd.rate.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-2">TOM</span>
                      <input
                        type="range" min={0} max={2} step={0.1}
                        value={cmd.pitch}
                        onChange={(e) => update(cmd.id, { pitch: parseFloat(e.target.value) })}
                        className="w-16 accent-studio-accent"
                      />
                      <span className="text-[9px] text-2 font-mono w-6">{cmd.pitch.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="cursor-text"
                  onClick={() => setEditingId(cmd.id)}
                >
                  <p className="text-0 text-sm truncate">"{cmd.text}"</p>
                  <p className="text-2 text-xs mt-0.5">
                    {cmd.voice === 'male' ? 'Masculina' : cmd.voice === 'female' ? 'Feminina' : 'Neutra'}
                    {' · '}Vel {cmd.rate.toFixed(1)}x{' · '}Tom {cmd.pitch.toFixed(1)}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => preview(cmd)}
                className="p-1.5 rounded text-2 hover:text-studio-accent hover:bg-2 transition"
                title="Pré-ouvir"
              >
                <Volume2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => update(cmd.id, { enabled: !cmd.enabled })}
                className={[
                  'p-1.5 rounded transition',
                  cmd.enabled ? 'text-studio-green hover:bg-2' : 'text-2 hover:bg-2',
                ].join(' ')}
                title={cmd.enabled ? 'Ativo' : 'Inativo'}
              >
                {cmd.enabled ? <Play className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </button>
              <button
                onClick={() => remove(cmd.id)}
                className="p-1.5 rounded text-2 hover:text-studio-red hover:bg-2 transition"
                title="Remover"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-c bg-0/40">
        <span className="text-2 text-xs">
          {commands.filter((c) => c.enabled).length} comandos ativos · {bpm} BPM
        </span>
        <button
          onClick={add}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-2 border border-c text-1 hover:text-0 hover:bg-3 transition text-sm"
        >
          <Plus className="w-4 h-4" /> Adicionar comando
        </button>
      </div>
    </div>
  );
}
