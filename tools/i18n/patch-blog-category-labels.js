#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const LOCALES_DIR = path.join(ROOT, '_locales');

/**
 * Observação: essas labels aparecem no menu/chips do blog e não estavam traduzidas
 * em alguns idiomas (ex.: zh_CN), porque foram adicionadas com fallback PT.
 */
const PATCHES = {
  pt_BR: {
    blogCategoryLabelProcrastinacao: 'Procrastinação',
    blogCategoryLabelFocoAtencao: 'Foco & Atenção',
    blogCategoryLabelDevPerformance: 'Performance Dev',
    blogCategoryLabelTrabalhoRemoto: 'Trabalho remoto',
    blogCategoryLabelUxDesign: 'UX & Design',
    blogCategoryLabelMarketing: 'Marketing',
    blogCategoryLabelProduto: 'Produto',
    blogCategoryLabelCarreira: 'Carreira',
    blogCategoryLabelNegocios: 'Negócios',
  },
  en_US: {
    blogCategoryLabelProcrastinacao: 'Procrastination',
    blogCategoryLabelFocoAtencao: 'Focus & Attention',
    blogCategoryLabelDevPerformance: 'Dev Performance',
    blogCategoryLabelTrabalhoRemoto: 'Remote work',
    blogCategoryLabelUxDesign: 'UX & Design',
    blogCategoryLabelMarketing: 'Marketing',
    blogCategoryLabelProduto: 'Product',
    blogCategoryLabelCarreira: 'Career',
    blogCategoryLabelNegocios: 'Business',
  },
  es_419: {
    blogCategoryLabelProcrastinacao: 'Procrastinación',
    blogCategoryLabelFocoAtencao: 'Enfoque y atención',
    blogCategoryLabelDevPerformance: 'Rendimiento dev',
    blogCategoryLabelTrabalhoRemoto: 'Trabajo remoto',
    blogCategoryLabelUxDesign: 'UX y diseño',
    blogCategoryLabelMarketing: 'Marketing',
    blogCategoryLabelProduto: 'Producto',
    blogCategoryLabelCarreira: 'Carrera',
    blogCategoryLabelNegocios: 'Negocios',
  },
  fr: {
    blogCategoryLabelProcrastinacao: 'Procrastination',
    blogCategoryLabelFocoAtencao: 'Focus & attention',
    blogCategoryLabelDevPerformance: 'Performance dev',
    blogCategoryLabelTrabalhoRemoto: 'Télétravail',
    blogCategoryLabelUxDesign: 'UX & design',
    blogCategoryLabelMarketing: 'Marketing',
    blogCategoryLabelProduto: 'Produit',
    blogCategoryLabelCarreira: 'Carrière',
    blogCategoryLabelNegocios: 'Business',
  },
  de: {
    blogCategoryLabelProcrastinacao: 'Prokrastination',
    blogCategoryLabelFocoAtencao: 'Fokus & Aufmerksamkeit',
    blogCategoryLabelDevPerformance: 'Dev-Performance',
    blogCategoryLabelTrabalhoRemoto: 'Remote-Arbeit',
    blogCategoryLabelUxDesign: 'UX & Design',
    blogCategoryLabelMarketing: 'Marketing',
    blogCategoryLabelProduto: 'Produkt',
    blogCategoryLabelCarreira: 'Karriere',
    blogCategoryLabelNegocios: 'Business',
  },
  it: {
    blogCategoryLabelProcrastinacao: 'Procrastinazione',
    blogCategoryLabelFocoAtencao: 'Focus e attenzione',
    blogCategoryLabelDevPerformance: 'Performance dev',
    blogCategoryLabelTrabalhoRemoto: 'Lavoro da remoto',
    blogCategoryLabelUxDesign: 'UX & design',
    blogCategoryLabelMarketing: 'Marketing',
    blogCategoryLabelProduto: 'Prodotto',
    blogCategoryLabelCarreira: 'Carriera',
    blogCategoryLabelNegocios: 'Business',
  },
  tr: {
    blogCategoryLabelProcrastinacao: 'Erteleme',
    blogCategoryLabelFocoAtencao: 'Odak ve dikkat',
    blogCategoryLabelDevPerformance: 'Geliştirici performansı',
    blogCategoryLabelTrabalhoRemoto: 'Uzaktan çalışma',
    blogCategoryLabelUxDesign: 'UX ve tasarım',
    blogCategoryLabelMarketing: 'Pazarlama',
    blogCategoryLabelProduto: 'Ürün',
    blogCategoryLabelCarreira: 'Kariyer',
    blogCategoryLabelNegocios: 'İş dünyası',
  },
  zh_CN: {
    blogCategoryLabelProcrastinacao: '拖延',
    blogCategoryLabelFocoAtencao: '专注与注意力',
    blogCategoryLabelDevPerformance: '开发者性能',
    blogCategoryLabelTrabalhoRemoto: '远程工作',
    blogCategoryLabelUxDesign: 'UX 与设计',
    blogCategoryLabelMarketing: '营销',
    blogCategoryLabelProduto: '产品',
    blogCategoryLabelCarreira: '职业发展',
    blogCategoryLabelNegocios: '商业',
  },
  hi: {
    blogCategoryLabelProcrastinacao: 'टालमटोल',
    blogCategoryLabelFocoAtencao: 'फोकस और ध्यान',
    blogCategoryLabelDevPerformance: 'डेवलपर परफॉर्मेंस',
    blogCategoryLabelTrabalhoRemoto: 'रिमोट वर्क',
    blogCategoryLabelUxDesign: 'UX और डिज़ाइन',
    blogCategoryLabelMarketing: 'मार्केटिंग',
    blogCategoryLabelProduto: 'प्रोडक्ट',
    blogCategoryLabelCarreira: 'करियर',
    blogCategoryLabelNegocios: 'बिज़नेस',
  },
  ar: {
    blogCategoryLabelProcrastinacao: 'التسويف',
    blogCategoryLabelFocoAtencao: 'التركيز والانتباه',
    blogCategoryLabelDevPerformance: 'أداء المطورين',
    blogCategoryLabelTrabalhoRemoto: 'العمل عن بُعد',
    blogCategoryLabelUxDesign: 'تجربة المستخدم والتصميم',
    blogCategoryLabelMarketing: 'التسويق',
    blogCategoryLabelProduto: 'المنتج',
    blogCategoryLabelCarreira: 'المسار المهني',
    blogCategoryLabelNegocios: 'الأعمال',
  },
  bn: {
    blogCategoryLabelProcrastinacao: 'প্রোক্রাস্টিনেশন',
    blogCategoryLabelFocoAtencao: 'ফোকাস ও মনোযোগ',
    blogCategoryLabelDevPerformance: 'ডেভ পারফরম্যান্স',
    blogCategoryLabelTrabalhoRemoto: 'রিমোট কাজ',
    blogCategoryLabelUxDesign: 'UX ও ডিজাইন',
    blogCategoryLabelMarketing: 'মার্কেটিং',
    blogCategoryLabelProduto: 'প্রোডাক্ট',
    blogCategoryLabelCarreira: 'ক্যারিয়ার',
    blogCategoryLabelNegocios: 'ব্যবসা',
  },
  ru: {
    blogCategoryLabelProcrastinacao: 'Прокрастинация',
    blogCategoryLabelFocoAtencao: 'Фокус и внимание',
    blogCategoryLabelDevPerformance: 'Производительность разработчика',
    blogCategoryLabelTrabalhoRemoto: 'Удалённая работа',
    blogCategoryLabelUxDesign: 'UX и дизайн',
    blogCategoryLabelMarketing: 'Маркетинг',
    blogCategoryLabelProduto: 'Продукт',
    blogCategoryLabelCarreira: 'Карьера',
    blogCategoryLabelNegocios: 'Бизнес',
  },
  ur: {
    blogCategoryLabelProcrastinacao: 'ٹال مٹول',
    blogCategoryLabelFocoAtencao: 'فوکس اور توجہ',
    blogCategoryLabelDevPerformance: 'ڈویلپر پرفارمنس',
    blogCategoryLabelTrabalhoRemoto: 'ریموٹ کام',
    blogCategoryLabelUxDesign: 'UX اور ڈیزائن',
    blogCategoryLabelMarketing: 'مارکیٹنگ',
    blogCategoryLabelProduto: 'پروڈکٹ',
    blogCategoryLabelCarreira: 'کیریئر',
    blogCategoryLabelNegocios: 'کاروبار',
  },
};

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  const payload = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, `${payload}\n`, 'utf-8');
}

async function main() {
  const localeDirs = await fs.readdir(LOCALES_DIR, { withFileTypes: true });
  const folders = localeDirs.filter((d) => d.isDirectory()).map((d) => d.name);

  let changedCount = 0;
  for (const folder of folders) {
    const patch = PATCHES[folder];
    if (!patch) continue;

    const filePath = path.join(LOCALES_DIR, folder, 'messages.json');
    const json = await readJson(filePath);
    let changed = false;

    for (const [key, message] of Object.entries(patch)) {
      if (!json[key]) {
        json[key] = { message };
        changed = true;
        continue;
      }
      if (json[key].message !== message) {
        json[key].message = message;
        changed = true;
      }
    }

    if (changed) {
      await writeJson(filePath, json);
      changedCount += 1;
      console.log(`[i18n] Atualizado ${folder}/messages.json`);
    }
  }

  if (!changedCount) {
    console.log('[i18n] Nenhuma atualização necessária.');
  }
}

main().catch((error) => {
  console.error('[i18n] Falha ao atualizar labels de categoria do blog:', error);
  process.exitCode = 1;
});
