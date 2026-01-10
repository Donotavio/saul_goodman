#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const LOCALES_DIR = path.join(ROOT, '_locales');

const PATCHES = {
  pt_BR: {
    blogLogoAlt: 'Logo Saul Goodman',
    blogToneAltIncredulo: 'Saul Goodman incrédulo',
    blogToneAltLike: 'Saul Goodman aprovando',
    blogToneAltNaoCorte: 'Saul Goodman julgando',

    categoryUxTitle: 'UX & Design sob lupa',
    categoryUxLead: 'Design, usabilidade e decisões de produto que afetam seu foco no dia a dia.',
    mediaTaglineUx: 'UX, design e escolhas que tiram o usuário do modo vilão.',

    categoryMarketingTitle: 'Marketing sem promessa milagrosa',
    categoryMarketingLead: 'SEO, conteúdo e conversão com menos papo de guru e mais método.',
    mediaTaglineMarketing: 'SEO, conteúdo e funil sem feitiçaria.',

    categoryProdutoTitle: 'Produto e estratégia em audiência',
    categoryProdutoLead: 'Decisões, métricas e trade-offs de PM/PO para não virar refém do backlog.',
    mediaTaglineProduto: 'Produto julgado por dados, não por feeling.',

    categoryCarreiraTitle: 'Carreira sem roteiro de coach',
    categoryCarreiraLead: 'Hábitos, liderança e sobrevivência corporativa sem frases de LinkedIn.',
    mediaTaglineCarreira: 'Carreira sob interrogatório, com sarcasmo e pragmatismo.',

    categoryNegociosTitle: 'Negócios e liderança no tribunal',
    categoryNegociosLead: 'Gestão, cultura e impacto real — sem juridiquês e sem enrolação.',
    mediaTaglineNegocios: 'Negócios em pauta, com foco em execução.',
  },

  en_US: {
    blogLogoAlt: 'Saul Goodman logo',
    blogToneAltIncredulo: 'Saul Goodman, skeptical',
    blogToneAltLike: 'Saul Goodman, approving',
    blogToneAltNaoCorte: 'Saul Goodman, judging',

    categoryUxTitle: 'UX & Design under the spotlight',
    categoryUxLead: 'Design, usability, and product decisions that impact your day-to-day focus.',
    mediaTaglineUx: 'UX, design, and choices that keep users out of villain mode.',

    categoryMarketingTitle: 'Marketing with no miracle promises',
    categoryMarketingLead: 'SEO, content, and conversion with less guru talk and more method.',
    mediaTaglineMarketing: 'SEO, content, and funnels—no witchcraft.',

    categoryProdutoTitle: 'Product & strategy on trial',
    categoryProdutoLead: 'Decisions, metrics, and PM trade-offs so you don’t become hostage to the backlog.',
    mediaTaglineProduto: 'Product judged by data, not vibes.',

    categoryCarreiraTitle: 'Career without coach scripts',
    categoryCarreiraLead: 'Habits, leadership, and corporate survival without LinkedIn clichés.',
    mediaTaglineCarreira: 'Career under questioning, with sarcasm and pragmatism.',

    categoryNegociosTitle: 'Business & leadership in court',
    categoryNegociosLead: 'Management, culture, and real impact—no jargon, no fluff.',
    mediaTaglineNegocios: 'Business on the docket, focused on execution.',
  },

  es_419: {
    blogLogoAlt: 'Logo de Saul Goodman',
    blogToneAltIncredulo: 'Saul Goodman incrédulo',
    blogToneAltLike: 'Saul Goodman aprobando',
    blogToneAltNaoCorte: 'Saul Goodman juzgando',

    categoryUxTitle: 'UX y diseño bajo la lupa',
    categoryUxLead: 'Diseño, usabilidad y decisiones de producto que afectan tu enfoque diario.',
    mediaTaglineUx: 'UX, diseño y decisiones que sacan al usuario del modo villano.',

    categoryMarketingTitle: 'Marketing sin promesas milagrosas',
    categoryMarketingLead: 'SEO, contenido y conversión con menos gurú y más método.',
    mediaTaglineMarketing: 'SEO, contenido y embudo sin hechicería.',

    categoryProdutoTitle: 'Producto y estrategia en juicio',
    categoryProdutoLead: 'Decisiones, métricas y trade-offs de PM para no ser rehén del backlog.',
    mediaTaglineProduto: 'Producto juzgado por datos, no por intuición.',

    categoryCarreiraTitle: 'Carrera sin guion de coach',
    categoryCarreiraLead: 'Hábitos, liderazgo y supervivencia corporativa sin frases de LinkedIn.',
    mediaTaglineCarreira: 'Carrera bajo interrogatorio, con sarcasmo y pragmatismo.',

    categoryNegociosTitle: 'Negocios y liderazgo en el tribunal',
    categoryNegociosLead: 'Gestión, cultura e impacto real: sin jerga y sin relleno.',
    mediaTaglineNegocios: 'Negocios en pauta, enfocados en la ejecución.',
  },

  fr: {
    blogLogoAlt: 'Logo Saul Goodman',
    blogToneAltIncredulo: 'Saul Goodman, sceptique',
    blogToneAltLike: 'Saul Goodman, approbateur',
    blogToneAltNaoCorte: 'Saul Goodman, juge',

    categoryUxTitle: 'UX & design sous la loupe',
    categoryUxLead: "Design, ergonomie et décisions produit qui influencent votre concentration au quotidien.",
    mediaTaglineUx: 'UX, design et choix qui sortent l’utilisateur du mode vilain.',

    categoryMarketingTitle: 'Marketing sans promesse miracle',
    categoryMarketingLead: 'SEO, contenu et conversion: moins de gourou, plus de méthode.',
    mediaTaglineMarketing: 'SEO, contenu et tunnel sans sorcellerie.',

    categoryProdutoTitle: 'Produit & stratégie à l’audience',
    categoryProdutoLead: 'Décisions, métriques et compromis PM/PO pour ne pas devenir otage du backlog.',
    mediaTaglineProduto: 'Produit jugé sur les données, pas au feeling.',

    categoryCarreiraTitle: 'Carrière sans script de coach',
    categoryCarreiraLead: 'Habitudes, leadership et survie corporate sans phrases LinkedIn.',
    mediaTaglineCarreira: 'Carrière à l’interrogatoire, avec sarcasme et pragmatisme.',

    categoryNegociosTitle: 'Business et leadership au tribunal',
    categoryNegociosLead: 'Gestion, culture et impact réel — sans jargon ni blabla.',
    mediaTaglineNegocios: 'Business à l’ordre du jour, focus exécution.',
  },

  de: {
    blogLogoAlt: 'Saul Goodman Logo',
    blogToneAltIncredulo: 'Saul Goodman, skeptisch',
    blogToneAltLike: 'Saul Goodman, zustimmend',
    blogToneAltNaoCorte: 'Saul Goodman, urteilend',

    categoryUxTitle: 'UX & Design unter der Lupe',
    categoryUxLead: 'Design, Usability und Produktentscheidungen, die deinen Fokus im Alltag beeinflussen.',
    mediaTaglineUx: 'UX, Design und Entscheidungen, die Nutzer aus dem Schurkenmodus holen.',

    categoryMarketingTitle: 'Marketing ohne Wunder-Versprechen',
    categoryMarketingLead: 'SEO, Content und Conversion – weniger Guru-Gerede, mehr Methode.',
    mediaTaglineMarketing: 'SEO, Content und Funnel – ohne Hexerei.',

    categoryProdutoTitle: 'Produkt & Strategie vor Gericht',
    categoryProdutoLead: 'Entscheidungen, Metriken und PM-Abwägungen, damit du nicht Geisel des Backlogs wirst.',
    mediaTaglineProduto: 'Produkt nach Daten bewertet – nicht nach Bauchgefühl.',

    categoryCarreiraTitle: 'Karriere ohne Coach-Drehbuch',
    categoryCarreiraLead: 'Gewohnheiten, Führung und Corporate-Überleben ohne LinkedIn-Floskeln.',
    mediaTaglineCarreira: 'Karriere im Kreuzverhör – mit Sarkasmus und Pragmatismus.',

    categoryNegociosTitle: 'Business & Führung im Gerichtssaal',
    categoryNegociosLead: 'Management, Kultur und echter Impact – ohne Juristendeutsch und ohne BlaBla.',
    mediaTaglineNegocios: 'Business auf der Agenda – Fokus auf Umsetzung.',
  },

  it: {
    blogLogoAlt: 'Logo Saul Goodman',
    blogToneAltIncredulo: 'Saul Goodman, scettico',
    blogToneAltLike: 'Saul Goodman, approvazione',
    blogToneAltNaoCorte: 'Saul Goodman, giudicante',

    categoryUxTitle: 'UX e design sotto la lente',
    categoryUxLead: 'Design, usabilità e decisioni di prodotto che influenzano il tuo focus ogni giorno.',
    mediaTaglineUx: 'UX, design e scelte che tirano l’utente fuori dalla modalità cattivo.',

    categoryMarketingTitle: 'Marketing senza promesse miracolose',
    categoryMarketingLead: 'SEO, contenuti e conversione con meno guru e più metodo.',
    mediaTaglineMarketing: 'SEO, contenuti e funnel senza stregoneria.',

    categoryProdutoTitle: 'Prodotto e strategia in aula',
    categoryProdutoLead: 'Decisioni, metriche e compromessi PM/PO per non diventare ostaggio del backlog.',
    mediaTaglineProduto: 'Prodotto giudicato dai dati, non dall’istinto.',

    categoryCarreiraTitle: 'Carriera senza copione da coach',
    categoryCarreiraLead: 'Abitudini, leadership e sopravvivenza corporate senza frasi da LinkedIn.',
    mediaTaglineCarreira: 'Carriera sotto interrogatorio, con sarcasmo e pragmatismo.',

    categoryNegociosTitle: 'Business e leadership in tribunale',
    categoryNegociosLead: 'Gestione, cultura e impatto reale — senza gergo e senza fumo.',
    mediaTaglineNegocios: 'Business in agenda, focus sull’esecuzione.',
  },

  tr: {
    blogLogoAlt: 'Saul Goodman logosu',
    blogToneAltIncredulo: 'Saul Goodman, şüpheci',
    blogToneAltLike: 'Saul Goodman, onaylıyor',
    blogToneAltNaoCorte: 'Saul Goodman, yargılıyor',

    categoryUxTitle: 'UX ve Tasarım mercek altında',
    categoryUxLead: 'Tasarım, kullanılabilirlik ve ürün kararları; günlük odağını etkileyen şeyler.',
    mediaTaglineUx: 'Kullanıcıyı kötü adam modundan çıkaran UX, tasarım ve kararlar.',

    categoryMarketingTitle: 'Mucize vaat etmeyen pazarlama',
    categoryMarketingLead: 'SEO, içerik ve dönüşüm: daha az guru, daha çok yöntem.',
    mediaTaglineMarketing: 'SEO, içerik ve huni — büyü yok.',

    categoryProdutoTitle: 'Ürün ve strateji mahkemede',
    categoryProdutoLead: 'Kararlar, metrikler ve PM/PO dengeleri: backlog rehinine dönüşmemek için.',
    mediaTaglineProduto: 'Ürün içgüdüyle değil verilerle yargılanır.',

    categoryCarreiraTitle: 'Koç senaryosu olmadan kariyer',
    categoryCarreiraLead: 'Alışkanlıklar, liderlik ve kurumsal hayatta kalma — LinkedIn klişeleri yok.',
    mediaTaglineCarreira: 'Kariyer sorguda: sarcasm ve pragmatizmle.',

    categoryNegociosTitle: 'İş dünyası ve liderlik mahkemede',
    categoryNegociosLead: 'Yönetim, kültür ve gerçek etki — jargon yok, oyalama yok.',
    mediaTaglineNegocios: 'İş gündemde: odak icraatta.',
  },

  zh_CN: {
    blogLogoAlt: 'Saul Goodman 标志',
    blogToneAltIncredulo: 'Saul Goodman（怀疑）',
    blogToneAltLike: 'Saul Goodman（认可）',
    blogToneAltNaoCorte: 'Saul Goodman（审判）',

    categoryUxTitle: 'UX 与设计在聚光灯下',
    categoryUxLead: '设计、可用性与产品决策，如何影响你每天的专注。',
    mediaTaglineUx: 'UX、设计与决策，把用户从“反派模式”里拉出来。',

    categoryMarketingTitle: '不卖奇迹的营销',
    categoryMarketingLead: 'SEO、内容与转化：少点大师话术，多点方法论。',
    mediaTaglineMarketing: 'SEO、内容与漏斗——不靠玄学。',

    categoryProdutoTitle: '产品与战略开庭',
    categoryProdutoLead: '决策、指标与 PM/PO 权衡：别让自己成为 backlog 的人质。',
    mediaTaglineProduto: '产品靠数据裁决，不靠感觉。',

    categoryCarreiraTitle: '不靠鸡汤的职业发展',
    categoryCarreiraLead: '习惯、领导力与职场生存：没有 LinkedIn 口号。',
    mediaTaglineCarreira: '职业发展被审问：讽刺但务实。',

    categoryNegociosTitle: '商业与领导力上庭',
    categoryNegociosLead: '管理、文化与真实影响：少点术语，多点执行。',
    mediaTaglineNegocios: '商业议题在案：聚焦执行。',
  },

  hi: {
    blogLogoAlt: 'Saul Goodman लोगो',
    blogToneAltIncredulo: 'Saul Goodman (संदेह)',
    blogToneAltLike: 'Saul Goodman (मंज़ूरी)',
    blogToneAltNaoCorte: 'Saul Goodman (जजमेंट)',

    categoryUxTitle: 'UX और डिज़ाइन पर नज़र',
    categoryUxLead: 'डिज़ाइन, यूज़ेबिलिटी और प्रोडक्ट फैसले जो आपके रोज़ के फोकस को प्रभावित करते हैं।',
    mediaTaglineUx: 'UX, डिज़ाइन और फैसले जो यूज़र को “विलेन मोड” से बाहर लाते हैं।',

    categoryMarketingTitle: 'बिना चमत्कारी वादों वाला मार्केटिंग',
    categoryMarketingLead: 'SEO, कंटेंट और कन्वर्ज़न: कम गुरु-गिरी, ज़्यादा तरीका।',
    mediaTaglineMarketing: 'SEO, कंटेंट और फ़नल — बिना जादू के।',

    categoryProdutoTitle: 'प्रोडक्ट और रणनीति अदालत में',
    categoryProdutoLead: 'फैसले, मेट्रिक्स और PM/PO के trade-offs ताकि आप backlog के बंधक न बनें।',
    mediaTaglineProduto: 'प्रोडक्ट का फ़ैसला डेटा से, फीलिंग से नहीं।',

    categoryCarreiraTitle: 'कोच स्क्रिप्ट के बिना करियर',
    categoryCarreiraLead: 'हैबिट्स, लीडरशिप और कॉरपोरेट सर्वाइवल — बिना LinkedIn क्लिशे।',
    mediaTaglineCarreira: 'करियर की जिरह: व्यंग्य और व्यवहारिकता के साथ।',

    categoryNegociosTitle: 'बिज़नेस और लीडरशिप अदालत में',
    categoryNegociosLead: 'मैनेजमेंट, कल्चर और असली असर — बिना जार्गन और बिना बकवास।',
    mediaTaglineNegocios: 'बिज़नेस एजेंडा पर: फोकस execution पर।',
  },

  ar: {
    blogLogoAlt: 'شعار Saul Goodman',
    blogToneAltIncredulo: 'سول غودمان (متشكّك)',
    blogToneAltLike: 'سول غودمان (موافق)',
    blogToneAltNaoCorte: 'سول غودمان (يحكم)',

    categoryUxTitle: 'تجربة المستخدم والتصميم تحت المجهر',
    categoryUxLead: 'التصميم وسهولة الاستخدام وقرارات المنتج التي تؤثر على تركيزك اليومي.',
    mediaTaglineUx: 'تجربة المستخدم والتصميم وقرارات تُخرج المستخدم من وضع الشرير.',

    categoryMarketingTitle: 'تسويق بلا وعود معجزة',
    categoryMarketingLead: 'SEO والمحتوى والتحويل: أقل هراء، أكثر منهجية.',
    mediaTaglineMarketing: 'SEO ومحتوى وقمع بلا سحر.',

    categoryProdutoTitle: 'المنتج والاستراتيجية في المحكمة',
    categoryProdutoLead: 'قرارات ومؤشرات ومفاضلات PM/PO كي لا تصبح رهينة الـ backlog.',
    mediaTaglineProduto: 'المنتج يُحكم عليه بالبيانات لا بالإحساس.',

    categoryCarreiraTitle: 'مسار مهني بلا نصائح مدربين',
    categoryCarreiraLead: 'عادات وقيادة وبقاء مؤسسي بلا عبارات لينكدإن.',
    mediaTaglineCarreira: 'المسار المهني تحت الاستجواب: بسخرية وبراغماتية.',

    categoryNegociosTitle: 'الأعمال والقيادة في المحكمة',
    categoryNegociosLead: 'إدارة وثقافة وأثر حقيقي — بلا مصطلحات وبلا لف ودوران.',
    mediaTaglineNegocios: 'الأعمال على الطاولة: التركيز على التنفيذ.',
  },

  bn: {
    blogLogoAlt: 'Saul Goodman লোগো',
    blogToneAltIncredulo: 'Saul Goodman (সন্দেহপ্রবণ)',
    blogToneAltLike: 'Saul Goodman (অনুমোদন)',
    blogToneAltNaoCorte: 'Saul Goodman (বিচার)',

    categoryUxTitle: 'UX ও ডিজাইন আলোচনায়',
    categoryUxLead: 'ডিজাইন, ইউজেবিলিটি এবং প্রোডাক্ট সিদ্ধান্ত—যা প্রতিদিনের ফোকাসে প্রভাব ফেলে।',
    mediaTaglineUx: 'UX, ডিজাইন ও সিদ্ধান্ত—যা ব্যবহারকারীকে “ভিলেন মোড” থেকে বের করে আনে।',

    categoryMarketingTitle: 'অলৌকিক প্রতিশ্রুতি ছাড়া মার্কেটিং',
    categoryMarketingLead: 'SEO, কনটেন্ট ও কনভার্সন: কম গুরু, বেশি পদ্ধতি।',
    mediaTaglineMarketing: 'SEO, কনটেন্ট ও ফানেল—কোনো জাদু নয়।',

    categoryProdutoTitle: 'প্রোডাক্ট ও স্ট্র্যাটেজি আদালতে',
    categoryProdutoLead: 'সিদ্ধান্ত, মেট্রিকস ও PM/PO trade-offs—backlog-এর জিম্মি না হতে।',
    mediaTaglineProduto: 'প্রোডাক্ট বিচার হয় ডেটায়, ফিলিংয়ে নয়।',

    categoryCarreiraTitle: 'কোচ স্ক্রিপ্ট ছাড়া ক্যারিয়ার',
    categoryCarreiraLead: 'অভ্যাস, নেতৃত্ব ও কর্পোরেট সারভাইভাল—LinkedIn ক্লিশে ছাড়া।',
    mediaTaglineCarreira: 'ক্যারিয়ার জিজ্ঞাসাবাদে: ব্যঙ্গ ও বাস্তবতার সাথে।',

    categoryNegociosTitle: 'ব্যবসা ও নেতৃত্ব আদালতে',
    categoryNegociosLead: 'ম্যানেজমেন্ট, কালচার ও বাস্তব প্রভাব—জার্গন নয়, ঘুরপাক নয়।',
    mediaTaglineNegocios: 'ব্যবসা আলোচনায়: এক্সিকিউশনে ফোকাস।',
  },

  ru: {
    blogLogoAlt: 'Логотип Saul Goodman',
    blogToneAltIncredulo: 'Сол Гудман (скептичен)',
    blogToneAltLike: 'Сол Гудман (одобряет)',
    blogToneAltNaoCorte: 'Сол Гудман (судит)',

    categoryUxTitle: 'UX и дизайн под лупой',
    categoryUxLead: 'Дизайн, удобство и продуктовые решения, которые влияют на ваш ежедневный фокус.',
    mediaTaglineUx: 'UX, дизайн и решения, которые выводят пользователя из «режима злодея».',

    categoryMarketingTitle: 'Маркетинг без чудо-обещаний',
    categoryMarketingLead: 'SEO, контент и конверсия: меньше гуру, больше метода.',
    mediaTaglineMarketing: 'SEO, контент и воронка — без магии.',

    categoryProdutoTitle: 'Продукт и стратегия в суде',
    categoryProdutoLead: 'Решения, метрики и компромиссы PM/PO, чтобы не стать заложником бэклога.',
    mediaTaglineProduto: 'Продукт судят по данным, а не по ощущениям.',

    categoryCarreiraTitle: 'Карьера без сценария коуча',
    categoryCarreiraLead: 'Привычки, лидерство и выживание в корпорации без фраз из LinkedIn.',
    mediaTaglineCarreira: 'Карьера на допросе: с сарказмом и прагматизмом.',

    categoryNegociosTitle: 'Бизнес и лидерство в суде',
    categoryNegociosLead: 'Управление, культура и реальный эффект — без жаргона и без воды.',
    mediaTaglineNegocios: 'Бизнес на повестке: фокус на исполнении.',
  },

  ur: {
    blogLogoAlt: 'Saul Goodman لوگو',
    blogToneAltIncredulo: 'Saul Goodman (شک میں)',
    blogToneAltLike: 'Saul Goodman (منظوری)',
    blogToneAltNaoCorte: 'Saul Goodman (فیصلہ سناتے)',

    categoryUxTitle: 'UX اور ڈیزائن زیرِ نظر',
    categoryUxLead: 'ڈیزائن، یوزیبلٹی اور پروڈکٹ فیصلے جو روزمرہ فوکس پر اثر ڈالتے ہیں۔',
    mediaTaglineUx: 'UX، ڈیزائن اور فیصلے جو صارف کو “ویلن موڈ” سے باہر نکالتے ہیں۔',

    categoryMarketingTitle: 'بغیر معجزانہ دعوؤں والا مارکیٹنگ',
    categoryMarketingLead: 'SEO، مواد اور کنورژن: کم گرو باتیں، زیادہ طریقہ۔',
    mediaTaglineMarketing: 'SEO، مواد اور فنل — بغیر جادو کے۔',

    categoryProdutoTitle: 'پروڈکٹ اور حکمتِ عملی عدالت میں',
    categoryProdutoLead: 'فیصلے، میٹرکس اور PM/PO trade-offs تاکہ آپ backlog کے یرغمال نہ بنیں۔',
    mediaTaglineProduto: 'پروڈکٹ کا فیصلہ ڈیٹا سے ہوتا ہے، فیلنگ سے نہیں۔',

    categoryCarreiraTitle: 'کوچ اسکرپٹ کے بغیر کیریئر',
    categoryCarreiraLead: 'عادات، قیادت اور کارپوریٹ سروائیول — LinkedIn کلیشے کے بغیر۔',
    mediaTaglineCarreira: 'کیریئر سے جرح: طنز اور عملیت کے ساتھ۔',

    categoryNegociosTitle: 'کاروبار اور قیادت عدالت میں',
    categoryNegociosLead: 'مینجمنٹ، کلچر اور حقیقی اثر — بغیر اصطلاحات اور بغیر گھماؤ کے۔',
    mediaTaglineNegocios: 'کاروبار ایجنڈا پر: عملدرآمد پر فوکس۔',
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
  console.error('[i18n] Falha ao atualizar textos de categoria do blog:', error);
  process.exitCode = 1;
});
