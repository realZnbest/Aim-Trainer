import { useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import { Button, Card } from './primitives';
import { fromCm360, toCm360 } from '@/engine/sensitivity';
import { downloadText } from '../export';

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <label className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="opacity-70">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </label>
  );
}

function Num({
  value,
  min,
  max,
  step,
  onChange,
  aria,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  aria: string;
}): ReactElement {
  return (
    <input
      type="number"
      aria-label={aria}
      className="w-24 rounded border border-white/15 bg-black/40 px-2 py-1 text-right"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

const GAMES = ['valorant', 'cs2', 'apex', 'overwatch', 'fortnite'] as const;
type GameOpt = (typeof GAMES)[number];

export function SettingsPanel(): ReactElement {
  const { t } = useTranslation();
  const setView = useApp((s) => s.setView);
  const crosshair = useApp((s) => s.crosshair);
  const patchCrosshair = useApp((s) => s.patchCrosshair);
  const sens = useApp((s) => s.sens);
  const patchSens = useApp((s) => s.patchSens);
  const video = useApp((s) => s.video);
  const patchVideo = useApp((s) => s.patchVideo);
  const hitSound = useApp((s) => s.hitSound);
  const setHitSound = useApp((s) => s.setHitSound);
  const masterVolume = useApp((s) => s.masterVolume);
  const hitVolume = useApp((s) => s.hitVolume);
  const setVolumes = useApp((s) => s.setVolumes);
  const colorblind = useApp((s) => s.colorblind);
  const setColorblind = useApp((s) => s.setColorblind);
  const [valorantCode, setValorantCode] = useState('');

  const converted = GAMES.map((g) => ({
    game: g,
    sens: fromCm360(sens.cm360, g, sens.dpi),
  }));

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('settings')}</h1>
        <Button variant="ghost" onClick={() => setView('menu')}>
          {t('backToMenu')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-bold">{t('crosshair')} — live preview</h2>
          <div className="mb-2 flex h-24 items-center justify-center rounded bg-black/60">
            <svg
              width="64"
              height="64"
              viewBox="0 0 64 64"
              opacity={crosshair.alpha}
              aria-label="crosshair preview"
            >
              <g stroke={crosshair.color} strokeWidth={crosshair.thickness}>
                <line
                  x1={32 - crosshair.length - crosshair.gap}
                  y1="32"
                  x2={32 - crosshair.gap}
                  y2="32"
                />
                <line
                  x1={32 + crosshair.gap}
                  y1="32"
                  x2={32 + crosshair.length + crosshair.gap}
                  y2="32"
                />
                <line
                  x1="32"
                  y1={32 - crosshair.length - crosshair.gap}
                  x2="32"
                  y2={32 - crosshair.gap}
                />
                <line
                  x1="32"
                  y1={32 + crosshair.gap}
                  x2="32"
                  y2={32 + crosshair.length + crosshair.gap}
                />
              </g>
              {crosshair.dot && (
                <circle cx="32" cy="32" r={crosshair.thickness / 1.5} fill={crosshair.color} />
              )}
            </svg>
          </div>
          <Row label="Color">
            <input
              type="color"
              aria-label="crosshair color"
              value={crosshair.color}
              onChange={(e) => patchCrosshair({ color: e.target.value })}
            />
          </Row>
          <Row label="Gap">
            <Num
              aria="gap"
              value={crosshair.gap}
              min={0}
              max={20}
              step={1}
              onChange={(v) => patchCrosshair({ gap: v })}
            />
          </Row>
          <Row label="Thickness">
            <Num
              aria="thickness"
              value={crosshair.thickness}
              min={1}
              max={8}
              step={1}
              onChange={(v) => patchCrosshair({ thickness: v })}
            />
          </Row>
          <Row label="Length">
            <Num
              aria="length"
              value={crosshair.length}
              min={2}
              max={24}
              step={1}
              onChange={(v) => patchCrosshair({ length: v })}
            />
          </Row>
          <Row label="Alpha">
            <Num
              aria="alpha"
              value={crosshair.alpha}
              min={0.1}
              max={1}
              step={0.1}
              onChange={(v) => patchCrosshair({ alpha: v })}
            />
          </Row>
          <Row label="Dot">
            <input
              type="checkbox"
              aria-label="dot"
              checked={crosshair.dot}
              onChange={(e) => patchCrosshair({ dot: e.target.checked })}
            />
          </Row>
          <Row label="Outline">
            <input
              type="checkbox"
              aria-label="outline"
              checked={crosshair.outline}
              onChange={(e) => patchCrosshair({ outline: e.target.checked })}
            />
          </Row>
          <div className="mt-2 flex gap-2">
            <Button
              variant="ghost"
              onClick={() =>
                downloadText(
                  'crosshair.json',
                  JSON.stringify(crosshair, null, 2),
                  'application/json',
                )
              }
            >
              Export JSON
            </Button>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              aria-label="valorant crosshair code"
              placeholder="Valorant code (0;P;...)"
              className="w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-xs"
              value={valorantCode}
              onChange={(e) => setValorantCode(e.target.value)}
            />
            <Button
              variant="ghost"
              onClick={() => {
                // Valorant-style import: extract color hex segment if present, else keep settings.
                const m = valorantCode.match(/#?[0-9a-fA-F]{6}/);
                if (m) {
                  const hex = m[0].startsWith('#') ? m[0] : `#${m[0]}`;
                  patchCrosshair({ color: hex });
                }
              }}
            >
              Import
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-bold">{t('sensitivity')} (cm/360 source of truth)</h2>
          <Row label="cm/360">
            <Num
              aria="cm360"
              value={sens.cm360}
              min={5}
              max={120}
              step={0.1}
              onChange={(v) => patchSens({ cm360: v })}
            />
          </Row>
          <Row label="DPI">
            <Num
              aria="dpi"
              value={sens.dpi}
              min={100}
              max={32000}
              step={50}
              onChange={(v) => patchSens({ dpi: v })}
            />
          </Row>
          <Row label="Game reference">
            <select
              aria-label="game"
              className="rounded border border-white/15 bg-black/40 px-2 py-1"
              value={sens.game}
              onChange={(e) => {
                const game = e.target.value as GameOpt;
                patchSens({ game });
                try {
                  const s = fromCm360(sens.cm360, game, sens.dpi);
                  patchSens({ gameSens: +s.toFixed(4) });
                } catch {
                  /* ignore */
                }
              }}
            >
              {GAMES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Row>
          <Row label="In-game sens">
            <Num
              aria="game sens"
              value={sens.gameSens}
              min={0.001}
              max={100}
              step={0.001}
              onChange={(v) => {
                patchSens({ gameSens: v });
                try {
                  patchSens({
                    cm360: +toCm360({ from: sens.game, sens: v, dpi: sens.dpi }).toFixed(2),
                  });
                } catch {
                  /* ignore */
                }
              }}
            />
          </Row>
          <Row label="Mult X">
            <Num
              aria="multx"
              value={sens.multX}
              min={0.1}
              max={5}
              step={0.05}
              onChange={(v) => patchSens({ multX: v })}
            />
          </Row>
          <Row label="Mult Y">
            <Num
              aria="multy"
              value={sens.multY}
              min={0.1}
              max={5}
              step={0.05}
              onChange={(v) => patchSens({ multY: v })}
            />
          </Row>
          <Row label="Invert Y">
            <input
              type="checkbox"
              aria-label="invert y"
              checked={sens.invertY}
              onChange={(e) => patchSens({ invertY: e.target.checked })}
            />
          </Row>
          <div className="mt-2 rounded bg-black/40 p-2 text-xs">
            {converted.map((c) => (
              <div key={c.game} className="flex justify-between">
                <span className="opacity-60">{c.game}</span>
                <span>{c.sens.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-bold">{t('video')}</h2>
          <Row label="FOV">
            <Num
              aria="fov"
              value={video.fov}
              min={60}
              max={130}
              step={1}
              onChange={(v) => patchVideo({ fov: v })}
            />
          </Row>
          <Row label="Resolution scale">
            <Num
              aria="res scale"
              value={video.resolutionScale}
              min={0.5}
              max={2}
              step={0.1}
              onChange={(v) => patchVideo({ resolutionScale: v })}
            />
          </Row>
          <Row label="FPS cap">
            <Num
              aria="fps cap"
              value={video.fpsCap}
              min={30}
              max={360}
              step={30}
              onChange={(v) => patchVideo({ fpsCap: v })}
            />
          </Row>
          <Row label="Antialiasing">
            <input
              type="checkbox"
              aria-label="aa"
              checked={video.antialias}
              onChange={(e) => patchVideo({ antialias: e.target.checked })}
            />
          </Row>
          <Row label="Target contrast">
            <Num
              aria="contrast"
              value={video.contrast}
              min={0.5}
              max={2}
              step={0.05}
              onChange={(v) => patchVideo({ contrast: v })}
            />
          </Row>
          <Row label="Brightness">
            <Num
              aria="brightness"
              value={video.brightness}
              min={0.5}
              max={2}
              step={0.05}
              onChange={(v) => patchVideo({ brightness: v })}
            />
          </Row>
          <Row label="Colorblind palette">
            <select
              aria-label="colorblind"
              className="rounded border border-white/15 bg-black/40 px-2 py-1"
              value={colorblind}
              onChange={(e) =>
                setColorblind(
                  e.target.value as 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia',
                )
              }
            >
              <option value="none">none</option>
              <option value="deuteranopia">deuteranopia</option>
              <option value="protanopia">protanopia</option>
              <option value="tritanopia">tritanopia</option>
            </select>
          </Row>
        </Card>

        <Card>
          <h2 className="mb-1 font-bold">{t('audio')}</h2>
          <Row label="Hit sound">
            <select
              aria-label="hit sound"
              className="rounded border border-white/15 bg-black/40 px-2 py-1"
              value={hitSound}
              onChange={(e) => setHitSound(e.target.value as 'click' | 'tick' | 'thock' | 'beep')}
            >
              {['click', 'tick', 'thock', 'beep'].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Master volume">
            <Num
              aria="master vol"
              value={masterVolume}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setVolumes(v, hitVolume)}
            />
          </Row>
          <Row label="Hit volume">
            <Num
              aria="hit vol"
              value={hitVolume}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setVolumes(masterVolume, v)}
            />
          </Row>
          <p className="mt-2 text-xs opacity-60">
            Web Audio pre-decoded buffers, latencyHint interactive — zero decode in the hot path.
          </p>
        </Card>
      </div>
    </div>
  );
}
