import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import { ARENA_THEMES, MAP_THEMES, type MapTheme } from '../arenaThemes';
import { cn } from '../cn';

/** Tiny per-map schematic drawn from the palette (no images): each map reads differently. */
function MapSwatch({ theme }: { theme: MapTheme }): ReactElement {
  const c = ARENA_THEMES[theme];
  const target = <circle cx="32" cy="17" r="2" fill="#3772A4" />;
  return (
    <svg viewBox="0 0 64 36" className="h-9 w-16 shrink-0 rounded-sm" aria-hidden>
      {theme === 'range' && (
        <>
          <rect width="64" height="36" fill={c.fog} />
          <polygon points="0,0 20,9 20,27 0,36" fill={c.wall} />
          <polygon points="64,0 44,9 44,27 64,36" fill={c.wall} />
          <polygon points="0,0 64,0 44,9 20,9" fill={c.ceiling} />
          <polygon points="0,36 64,36 44,27 20,27" fill={c.floor} />
          <rect x="20" y="9" width="24" height="18" fill={c.front} />
          <line x1="0" y1="8" x2="20" y2="14" stroke={c.accent} strokeWidth="1.2" />
          <line x1="64" y1="8" x2="44" y2="14" stroke={c.accent} strokeWidth="1.2" />
          <line x1="0" y1="32" x2="20" y2="26" stroke={c.strip} strokeWidth="1.2" />
          <line x1="64" y1="32" x2="44" y2="26" stroke={c.strip} strokeWidth="1.2" />
          {target}
        </>
      )}
      {theme === 'hangar' && (
        <>
          <rect width="64" height="36" fill={c.front} />
          <path d="M0,36 L0,18 Q32,-10 64,18 L64,36 Z" fill={c.ceiling} />
          <path d="M6,36 L6,19 Q32,-3 58,19 L58,36 Z" fill={c.front} />
          <path d="M0,18 Q32,-10 64,18" fill="none" stroke={c.metal} strokeWidth="2" />
          <path d="M10,18 Q32,-2 54,18" fill="none" stroke={c.metal} strokeWidth="1.2" />
          <rect x="0" y="22" width="14" height="2" fill={c.metal} />
          <rect x="50" y="22" width="14" height="2" fill={c.metal} />
          <rect x="1" y="27" width="9" height="7" fill="#8a3b2b" />
          <rect x="54" y="27" width="9" height="7" fill="#2f5d7c" />
          <rect x="0" y="34" width="64" height="2" fill={c.accent} />
          {target}
        </>
      )}
      {theme === 'rooftop' && (
        <>
          <defs>
            <linearGradient id="sky-rooftop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c.skyTop} />
              <stop offset="0.55" stopColor={c.skyMid} />
              <stop offset="1" stopColor={c.skyHorizon} />
            </linearGradient>
          </defs>
          <rect width="64" height="36" fill="url(#sky-rooftop)" />
          <circle cx="9" cy="24" r="4" fill={c.sun} opacity="0.9" />
          <rect x="30" y="22" width="5" height="9" fill="#1b1536" />
          <rect x="38" y="19" width="6" height="12" fill="#241a45" />
          <rect x="46" y="23" width="7" height="8" fill="#1b1536" />
          <rect x="0" y="31" width="64" height="5" fill={c.wall} />
          <rect x="0" y="30" width="64" height="1.5" fill={c.lamp} opacity="0.8" />
          {target}
        </>
      )}
      {theme === 'void' && (
        <>
          <defs>
            <linearGradient id="sky-void" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c.skyTop} />
              <stop offset="0.6" stopColor={c.skyMid} />
              <stop offset="1" stopColor={c.skyHorizon} />
            </linearGradient>
          </defs>
          <rect width="64" height="36" fill="url(#sky-void)" />
          <circle cx="12" cy="17" r="5" fill={c.sun} />
          <rect x="6" y="20" width="12" height="1.2" fill={c.skyMid} />
          <rect x="6" y="22.4" width="12" height="1.2" fill={c.skyMid} />
          <polygon points="38,24 46,17 54,24" fill="none" stroke={c.glow} strokeWidth="0.8" />
          <rect x="0" y="24" width="64" height="12" fill={c.floor} />
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1={32 + (i - 2) * 4}
              y1="24"
              x2={32 + (i - 2) * 18}
              y2="36"
              stroke={c.gridMajor}
              strokeWidth="0.6"
            />
          ))}
          {[27, 30, 34].map((y) => (
            <line key={y} x1="0" y1={y} x2="64" y2={y} stroke={c.gridMinor} strokeWidth="0.6" />
          ))}
          {target}
        </>
      )}
    </svg>
  );
}

/** Visible, one-click map choice. Used on the menu and in Settings. */
export function MapPicker({ compact = false }: { compact?: boolean }): ReactElement {
  const { t } = useTranslation();
  const mapTheme = useApp((s) => s.video.mapTheme);
  const patchVideo = useApp((s) => s.patchVideo);

  return (
    <div role="radiogroup" aria-label={t('set_map')} className="flex flex-wrap gap-2">
      {MAP_THEMES.map((m) => {
        const active = m === mapTheme;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`map ${m}`}
            onClick={() => patchVideo({ mapTheme: m })}
            className={cn(
              'flex items-center gap-3 rounded-lg border bg-panel text-left transition-colors',
              compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
              active ? 'border-brand' : 'border-linesoft hover:border-line',
            )}
          >
            <MapSwatch theme={m} />
            <span className="font-display text-sm font-semibold uppercase tracking-tight">
              {t(`map_${m}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
