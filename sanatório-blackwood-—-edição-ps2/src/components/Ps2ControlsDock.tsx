import { ChevronDown, ChevronUp, Monitor, Layers } from 'lucide-react';
import { FloorKey, Ps2PresetId, Ps2ResolutionId, Ps2Settings } from '../game/types';

interface Ps2ControlsDockProps {
  open: boolean;
  onToggleOpen: () => void;
  settings: Ps2Settings;
  currentFloor: FloorKey;
  onSelectPreset: (preset: Ps2PresetId) => void;
  onUpdateSettings: (patch: Partial<Ps2Settings>) => void;
  onJumpFloor: (floor: FloorKey) => void;
}

const PRESETS: { id: Ps2PresetId; label: string }[] = [
  { id: 'silent-fog', label: 'Silent Fog PS2' },
  { id: 'camcorder-480i', label: 'Camcorder IR' },
  { id: 'vhs-cursed', label: 'VHS Maldito' },
  { id: 'native-hd', label: 'Original HD' },
];

const RESOLUTIONS: { id: Ps2ResolutionId; label: string }[] = [
  { id: '320x240', label: '320×240' },
  { id: '512x448', label: '512×448' },
  { id: '640x448', label: '640×448' },
  { id: 'native', label: 'Nativo' },
];

const FLOORS: { id: FloorKey; label: string }[] = [
  { id: 'ext', label: 'Ext' },
  { id: 0, label: 'Térreo' },
  { id: 1, label: '1º' },
  { id: 2, label: '2º' },
  { id: 3, label: '3º' },
];

export function Ps2ControlsDock({
  open,
  onToggleOpen,
  settings,
  currentFloor,
  onSelectPreset,
  onUpdateSettings,
  onJumpFloor,
}: Ps2ControlsDockProps) {
  return (
    <div className="pointer-events-auto fixed right-4 bottom-4 z-30 flex flex-col items-end gap-1.5 sm:right-6 sm:bottom-5">
      {open && (
        <div
          className="w-[312px] border border-[#b8985e]/35 bg-[#0c0f0d]/95 p-3 text-[11px] text-[#e2dac9] shadow-2xl sm:w-[344px]"
          style={{ borderRadius: '4px' }}
        >
          {/* Presets */}
          <div className="mb-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[10px] tracking-[0.14em] text-[#989282] uppercase">
              <span className="flex items-center gap-1.5">
                <Monitor className="h-3 w-3 text-[#b8985e]" />
                Estilo Gráfico
              </span>
              <span className="font-mono text-[10px] text-[#b8985e]">[H]</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {PRESETS.map((p) => {
                const active = settings.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectPreset(p.id)}
                    className={`cursor-pointer border px-2 py-1 text-left font-medium transition-colors ${
                      active
                        ? 'border-[#b8985e] bg-[#362c1c] text-[#f5e7c4]'
                        : 'border-[#2b312d] bg-[#131815] text-[#c3bcac] hover:border-[#695a3d]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Internal Framebuffer Resolution */}
          <div className="mb-2.5">
            <div className="mb-1 text-[10px] tracking-[0.14em] text-[#989282] uppercase">
              Resolução Interna (VRAM)
            </div>
            <div className="grid grid-cols-4 gap-1 font-mono text-[10px]">
              {RESOLUTIONS.map((r) => {
                const active = settings.resolution === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onUpdateSettings({ resolution: r.id })}
                    className={`cursor-pointer border py-1 text-center transition-colors ${
                      active
                        ? 'border-[#b8985e] bg-[#362c1c] text-[#f5e7c4]'
                        : 'border-[#2b312d] bg-[#131815] text-[#a7a191] hover:border-[#695a3d]'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hardware toggles */}
          <div className="mb-2.5 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  dithering: !settings.dithering,
                  colorBits: !settings.dithering ? 15 : 24,
                })
              }
              className={`flex cursor-pointer items-center justify-between border px-2 py-1 ${
                settings.dithering
                  ? 'border-[#b8985e]/70 bg-[#232018] text-[#e8d9b5]'
                  : 'border-[#2b312d] bg-[#131815] text-[#8a8475]'
              }`}
            >
              <span>Dither 16-bit</span>
              <span className="font-mono text-[10px]">{settings.dithering ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ scanlines: !settings.scanlines })}
              className={`flex cursor-pointer items-center justify-between border px-2 py-1 ${
                settings.scanlines
                  ? 'border-[#b8985e]/70 bg-[#232018] text-[#e8d9b5]'
                  : 'border-[#2b312d] bg-[#131815] text-[#8a8475]'
              }`}
            >
              <span>Scanlines 480i</span>
              <span className="font-mono text-[10px]">{settings.scanlines ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ pixelTextures: !settings.pixelTextures })}
              className={`flex cursor-pointer items-center justify-between border px-2 py-1 ${
                settings.pixelTextures
                  ? 'border-[#b8985e]/70 bg-[#232018] text-[#e8d9b5]'
                  : 'border-[#2b312d] bg-[#131815] text-[#8a8475]'
              }`}
            >
              <span>Texturas Pixel</span>
              <span className="font-mono text-[10px]">{settings.pixelTextures ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ vertexSnap: !settings.vertexSnap })}
              className={`flex cursor-pointer items-center justify-between border px-2 py-1 ${
                settings.vertexSnap
                  ? 'border-[#b8985e]/70 bg-[#232018] text-[#e8d9b5]'
                  : 'border-[#2b312d] bg-[#131815] text-[#8a8475]'
              }`}
            >
              <span>Vertex Snap</span>
              <span className="font-mono text-[10px]">{settings.vertexSnap ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {/* Floor quick navigation */}
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] tracking-[0.14em] text-[#989282] uppercase">
              <Layers className="h-3 w-3 text-[#b8985e]" />
              Navegação de Andares
            </div>
            <div className="grid grid-cols-5 gap-1 font-mono text-[10px]">
              {FLOORS.map((f) => {
                const active = currentFloor === f.id;
                return (
                  <button
                    key={String(f.id)}
                    type="button"
                    onClick={() => onJumpFloor(f.id)}
                    className={`cursor-pointer border py-1 text-center transition-colors ${
                      active
                        ? 'border-[#b8985e] bg-[#362c1c] text-[#f5e7c4]'
                        : 'border-[#2b312d] bg-[#131815] text-[#a7a191] hover:border-[#695a3d]'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onToggleOpen}
        className="flex cursor-pointer items-center gap-2 border border-[#b8985e]/45 bg-[#0c0f0d]/95 px-3 py-1.5 text-[11px] font-medium tracking-wider text-[#e2dac9] uppercase transition-colors hover:border-[#b8985e]"
        style={{ borderRadius: '4px' }}
      >
        <span className="font-mono text-[#b8985e]">PS2</span>
        <span>{open ? 'Ocultar' : 'Gráficos & Andares'}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-[#989282]" /> : <ChevronUp className="h-3.5 w-3.5 text-[#989282]" />}
      </button>
    </div>
  );
}
