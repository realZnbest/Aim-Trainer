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
      best: 'Best',
      newBest: 'New best',
      firstRun: 'First run',
      language: 'Language',
    },
  },
  th: {
    translation: {
      appName: 'Aim Trainer',
      play: 'เล่น',
      dashboard: 'แดชบอร์ด',
      settings: 'ตั้งค่า',
      scenarios: 'โหมดฝึก',
      start: 'เริ่ม',
      clickToLock: 'คลิกเพื่อล็อกเมาส์',
      score: 'คะแนน',
      accuracy: 'ความแม่นยำ',
      reaction: 'ปฏิกิริยา',
      tier: 'แรงก์',
      consent: 'เราเก็บข้อมูลการฝึกไว้ในเครื่องของคุณเท่านั้น การซิงก์คลาวด์ปิดอยู่โดยค่าเริ่มต้น',
      accept: 'ยอมรับ',
      decline: 'ปฏิเสธ',
      needMouse: 'Aim Trainer ต้องใช้เมาส์และคีย์บอร์ดบน Chrome/Edge/Firefox เดสก์ท็อป',
      results: 'ผลลัพธ์',
      playAgain: 'เล่นอีกครั้ง',
      backToMenu: 'กลับเมนู',
      exportCsv: 'ส่งออก CSV',
      exportJson: 'ส่งออก JSON',
      video: 'ภาพ',
      audio: 'เสียง',
      crosshair: 'ครอสแฮร์',
      sensitivity: 'ความไว',
      seconds: 'วิ',
      best: 'สูงสุด',
      newBest: 'สถิติใหม่',
      firstRun: 'รอบแรก',
      language: 'ภาษา',
    },
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    // English by default; only an explicit choice in Settings (saved) switches language.
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'aim-trainer-lang',
    },
    supportedLngs: ['en', 'th'],
    interpolation: { escapeValue: false },
  });

export default i18n;
