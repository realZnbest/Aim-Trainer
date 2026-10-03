import type { TFunction } from 'i18next';
import type { Scenario } from '@/scenarios/schema';

/** Localized drill name/brief; falls back to the authored English (custom drills, unknown ids). */
export function scenarioText(
  t: TFunction,
  s: Pick<Scenario, 'id' | 'title' | 'description'>,
): {
  title: string;
  description: string;
} {
  return {
    title: t(`drill_${s.id}_title`, { defaultValue: s.title }),
    description: t(`drill_${s.id}_desc`, { defaultValue: s.description }),
  };
}
