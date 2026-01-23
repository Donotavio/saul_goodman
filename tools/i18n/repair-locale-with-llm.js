#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const LOCALES_DIR = path.join(ROOT, '_locales');

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 120000;
const MAX_RETRIES = 2;

const LOCALE_META = {
  en_US: { lang: 'en', label: 'inglês (EUA)', display: 'English (US)' },
  es_419: { lang: 'es', label: 'espanhol (América Latina)', display: 'Español (LatAm)' },
  fr: { lang: 'fr', label: 'francês', display: 'Français' },
  de: { lang: 'de', label: 'alemão', display: 'Deutsch' },
  it: { lang: 'it', label: 'italiano', display: 'Italiano' },
  tr: { lang: 'tr', label: 'turco', display: 'Türkçe' },
  zh_CN: { lang: 'zh', label: 'chinês (simplificado)', display: '简体中文' },
  hi: { lang: 'hi', label: 'hindi', display: 'हिन्दी' },
  ar: { lang: 'ar', label: 'árabe', display: 'العربية' },
  bn: { lang: 'bn', label: 'bengali', display: 'বাংলা' },
  ru: { lang: 'ru', label: 'russo', display: 'Русский' },
  ur: { lang: 'ur', label: 'urdu', display: 'اردو' },
};

function parseArgs(argv) {
  const args = { locale: null, mode: 'suspicious', limit: 80 };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--locale') {
      args.locale = argv[i + 1];
      i += 1;
    } else if (token === '--mode') {
      args.mode = argv[i + 1];
      i += 1;
    } else if (token === '--limit') {
      args.limit = Number(argv[i + 1]) || args.limit;
      i += 1;
    }
  }
  return args;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function writeJsonSorted(filePath, data) {
  const ordered = Object.keys(data)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => {
      acc[key] = data[key];
      return acc;
    }, {});
  await fs.writeFile(filePath, `${JSON.stringify(ordered, null, 2)}\n`, 'utf-8');
}

function isSuspiciousMessage(localeFolder, message, baseMessage) {
  if (typeof message !== 'string' || !message.trim()) return true;
  const text = message;

  // Marcadores conhecidos de lixo / scrape.
  const garbageMarkers = [
    '原始内容存档',
    '中国植物物种信息数据库',
    '地方自治协会',
    '国家妇女委员会',
  ];
  if (garbageMarkers.some((m) => text.includes(m))) return true;

  // Heurística específica: zh_CN não deveria conter frases PT inteiras.
  if (localeFolder === 'zh_CN') {
    const ptMarkers = ['você', 'Quando ativado', 'Use o popup', 'Saul nunca', 'feriado', 'férias'];
    if (ptMarkers.some((m) => text.includes(m))) return true;
  }

  // Se estiver igual ao pt_BR, é fallback.
  if (typeof baseMessage === 'string' && text.trim() === baseMessage.trim()) return true;

  return false;
}

async function callLLM(prompt) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY ausente');

  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const DEFAULT_ENDPOINTS = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
  };
  const base = process.env.LLM_BASE_URL || DEFAULT_ENDPOINTS[LLM_PROVIDER];
  if (!base) {
    throw new Error(`LLM_PROVIDER '${LLM_PROVIDER}' requer LLM_BASE_URL explícito ou configuração em DEFAULT_ENDPOINTS`);
  }
  const baseUrl = base.endsWith('/') ? base : `${base}/`;
  const url = `${baseUrl}chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'Você é um tradutor profissional de UI. Responda APENAS com JSON válido (sem markdown).',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_tokens: 3500,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error(`LLM falhou: ${response.status} ${await response.text()}`);
    }
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Resposta do LLM vazia');
    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function callLLMWithRetry(prompt, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callLLM(prompt);
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const backoffMs = 1000 * (attempt + 1);
      console.warn(`[i18n] Tentativa ${attempt + 1} falhou, tentando novamente em ${backoffMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

function parseJson(text) {
  const cleaned = text.trim().replace(/```json/gi, '```').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const preview = cleaned.slice(0, 200);
    throw new Error(
      `Falha ao parsear resposta do LLM como JSON. Resposta: ${preview}${cleaned.length > 200 ? '...' : ''}`,
      { cause: error }
    );
  }
}

async function repairLocale(localeFolder, mode, limit) {
  const meta = LOCALE_META[localeFolder];
  if (!meta) {
    const available = Object.keys(LOCALE_META).join(', ');
    throw new Error(`Locale '${localeFolder}' não suportado. Use: ${available}`);
  }

  // Verificar se arquivo existe
  const targetPath = path.join(LOCALES_DIR, localeFolder, 'messages.json');
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(
      `Arquivo não encontrado: ${targetPath}. Execute 'npm run i18n:stubs' primeiro.`
    );
  }

  const base = await readJson(path.join(LOCALES_DIR, 'pt_BR', 'messages.json'));
  const target = await readJson(targetPath);

  const keys = Object.keys(base);
  const toFix = [];
  for (const key of keys) {
    const baseMsg = base[key]?.message;
    const msg = target[key]?.message;
    if (mode === 'missing') {
      if (typeof msg !== 'string' || !msg.trim()) {
        toFix.push(key);
      }
      continue;
    }
    if (mode === 'all') {
      if (typeof baseMsg === 'string' && baseMsg.trim()) {
        toFix.push(key);
      }
      continue;
    }
    if (isSuspiciousMessage(localeFolder, msg, baseMsg)) {
      toFix.push(key);
    }
  }

  if (!toFix.length) {
    console.log(`[i18n] Nada para reparar em ${localeFolder}.`);
    return;
  }

  const batch = toFix.slice(0, limit);
  console.log(`[i18n] Reparando ${batch.length}/${toFix.length} chaves em ${localeFolder}...`);

  const payload = {};
  for (const key of batch) {
    payload[key] = base[key]?.message || '';
  }

  const prompt = `Traduza as strings abaixo do pt-BR para ${meta.label} (${meta.display}).\n\n` +
    `Regras importantes:\n` +
    `- Preserve placeholders como {threshold}, {name}, {minutes} exatamente como estão.\n` +
    `- Mantenha URLs, códigos e nomes próprios (Saul, Nager.Date) quando fizer sentido.\n` +
    `- Retorne um JSON com as MESMAS chaves e valores como strings traduzidas.\n\n` +
    `INPUT_JSON: ${JSON.stringify(payload)}`;

  const response = await callLLMWithRetry(prompt);
  const translated = parseJson(response);

  for (const [key, value] of Object.entries(translated || {})) {
    if (!target[key]) target[key] = { message: '' };
    target[key].message = String(value ?? '').trim();
  }

  await writeJsonSorted(targetPath, target);
  console.log(`[i18n] Locale atualizado: ${targetPath}`);
}

async function main() {
  const { locale, mode, limit } = parseArgs(process.argv);
  if (!locale) {
    console.error('Uso: node tools/i18n/repair-locale-with-llm.js --locale <folder> [--mode suspicious|all] [--limit N]');
    process.exitCode = 2;
    return;
  }
  await repairLocale(locale, mode, limit);
}

main().catch((error) => {
  console.error('[i18n] Falha ao reparar locale:', error);
  process.exitCode = 1;
});
