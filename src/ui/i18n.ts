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
  th: {
    translation: {
      appName: 'Aim Trainer',
      play: 'เล่น',
      dashboard: 'แดชบอร์ด',
      settings: 'ตั้งค่า',
      scenarios: 'ด่านฝึก',
      start: 'เริ่ม',
      clickToLock: 'คลิกเพื่อล็อกเมาส์',
      score: 'คะแนน',
      accuracy: 'ความแม่นยำ',
      reaction: 'ปฏิกิริยา',
      tier: 'ระดับ',
      consent: 'เราบันทึกข้อมูลการฝึกไว้ในอุปกรณ์ของคุณเท่านั้น ไม่เปิด sync ภายนอกโดยค่าเริ่มต้น',
      accept: 'ยอมรับ',
      decline: 'ปฏิเสธ',
      needMouse: 'Aim Trainer ต้องใช้เมาส์ + คีย์บอร์ดบนเดสก์ท็อป Chrome/Edge/Firefox',
      results: 'ผลลัพธ์',
      playAgain: 'เล่นอีกครั้ง',
      backToMenu: 'กลับเมนู',
      exportCsv: 'ส่งออก CSV',
      exportJson: 'ส่งออก JSON',
      video: 'ภาพ',
      audio: 'เสียง',
      crosshair: 'เป้าเล็ง',
      sensitivity: 'ความไวเมาส์',
      seconds: 'วินาที',
    },
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'th'],
    interpolation: { escapeValue: false },
  });

export default i18n;
