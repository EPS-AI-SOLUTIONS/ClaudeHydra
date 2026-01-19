import i18next from 'i18next';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadLocale = (lang) => {
  const p = path.join(__dirname, `../locales/${lang}/translation.json`);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return {};
};

i18next.init({
  lng: process.env.LANG || 'en',
  fallbackLng: 'en',
  resources: {
    en: { translation: loadLocale('en') },
    pl: { translation: loadLocale('pl') }
  }
});

export default i18next;