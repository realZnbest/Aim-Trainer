import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      appName: 'Aim Trainer',
      play: 'Play',
      dashboard: 'Dashboard',
      settings: 'Settings',
      scenarios: 'Scenarios',
      start: 'Start',
      clickToLock: 'Click to lock mouse',
      score: 'Score',
      accuracy: 'Accuracy',
      reaction: 'Reaction',
      tier: 'Tier',
      consent:
        'We store your training data locally on your device only. Optional cloud sync is off by default.',
      accept: 'Accept',
      decline: 'Decline',
      needMouse: 'Aim Trainer requires a mouse + keyboard on desktop Chrome/Edge/Firefox.',
      results: 'Results',
      playAgain: 'Play again',
      backToMenu: 'Back to menu',
      exportCsv: 'Export CSV',
      exportJson: 'Export JSON',
      video: 'Video',
      audio: 'Audio',
      crosshair: 'Crosshair',
      sensitivity: 'Sensitivity',
      seconds: 's',
    },
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en'],
    interpolation: { escapeValue: false },
  });

export default i18n;
