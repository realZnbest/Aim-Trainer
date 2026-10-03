import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import { ARENA_THEMES, MAP_THEMES, type MapTheme } from '../arenaThemes';
import { cn } from '../cn';

/** Tiny corridor schematic drawn from the theme's own colors (no images). */
function MapSwatch({ theme }: { theme: MapTheme }): ReactElement {
  const c = ARENA_THEMES[theme];
  return (
    <svg viewBox="0 0 64 36" className="h-9 w-16 shrink-0 rounded-sm" aria-hidden>
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
      <circle cx="32" cy="18" r="2" fill="#3772A4" />
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
