import { describe, expect, it } from 'vitest';
import i18n from '@/ui/i18n';
import { BUILT_IN_SCENARIOS } from '@/scenarios/builtins';

function keys(lng: string): string[] {
  return Object.keys(i18n.getResourceBundle(lng, 'translation') as Record<string, string>).sort();
}

describe('i18n', () => {
  it('Thai has exactly the English keys', () => {
    expect(keys('th')).toEqual(keys('en'));
  });

  it('every built-in drill has a title and brief in both languages', () => {
    const en = i18n.getResourceBundle('en', 'translation') as Record<string, string>;
    const th = i18n.getResourceBundle('th', 'translation') as Record<string, string>;
    for (const s of BUILT_IN_SCENARIOS) {
      expect(en[`drill_${s.id}_title`], s.id).toBeTruthy();
      expect(th[`drill_${s.id}_desc`], s.id).toBeTruthy();
      // English copy must stay in sync with the authored scenario text
      expect(en[`drill_${s.id}_desc`]).toBe(s.description);
    }
  });
});

describe('insight copy', () => {
  it('interpolates params in both languages', () => {
    expect(i18n.t('insight_accuracy-low_detail', { lng: 'en', v: '61.5' })).toContain('61.5%');
    expect(i18n.t('insight_tracking-low_detail', { lng: 'th', v: '40.0', rms: '2.50' })).toContain(
      '2.50',
    );
  });
});
