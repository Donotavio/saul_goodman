/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReasonText, translateSuggestionReason } from '../shared/utils/suggestion-reasons.js';

function createTranslator() {
  const dictionary: Record<string, string> = {
    suggestion_reason_source_title: 'título',
    suggestion_reason_source_hostname: 'domínio',
    suggestion_reason_keyword: 'Achei "{keyword}" em {source}; isso pesa no veredito.',
    suggestion_reason_path: 'O caminho "{path}" entrou no radar.',
    suggestion_reason_ml_family_host: 'o domínio',
    suggestion_reason_ml_detail: ' ({value})',
    suggestion_reason_direction_procrastination: 'tem cheiro de procrastinação',
    suggestion_reason_direction_productive: 'puxa para produtivo',
    suggestion_reason_impact_light: 'impacto leve',
    suggestion_reason_impact_medium: 'impacto médio',
    suggestion_reason_impact_strong: 'impacto forte',
    suggestion_reason_ml_signal:
      'Meu radar jurídico pegou {family}{detail}. Isso {direction} ({impact}).',
    suggestion_reason_learned_generic: 'Meu histórico local já viu {subject}; isso {direction}.',
    suggestion_reason_learned_fallback: 'Pelos sinais aprendidos, isso {direction}.'
  };
  return (key: string, substitutions?: Record<string, string | number>): string => {
    const template = dictionary[key] ?? key;
    if (!substitutions) {
      return template;
    }
    return Object.entries(substitutions).reduce((acc, [token, value]) => {
      return acc.replace(new RegExp(`\\{${token}\\}`, 'g'), String(value));
    }, template);
  };
}

test('sanitizeReasonText escapes HTML fragments', () => {
  const input = '<img src=x onerror=alert(1)>';
  const escaped = sanitizeReasonText(input);
  assert.equal(escaped.includes('<'), false);
  assert.ok(escaped.includes('&lt;img'));
});

test('translateSuggestionReason keeps unknown text as-is', () => {
  const raw = 'Motivo desconhecido que nao bate em regex alguma';
  const translated = translateSuggestionReason(raw, createTranslator());
  assert.equal(translated, raw);
});

test('translateSuggestionReason decodes HTML entities before matching', () => {
  const raw = 'Palavra-chave &quot;dashboard&quot; em título';
  const translated = translateSuggestionReason(raw, createTranslator());
  assert.equal(translated, 'Achei "dashboard" em título; isso pesa no veredito.');
});

test('translateSuggestionReason decodes HTML entities without semicolons', () => {
  const raw = 'Palavra-chave &quotdashboard&quot em título';
  const translated = translateSuggestionReason(raw, createTranslator());
  assert.equal(translated, 'Achei "dashboard" em título; isso pesa no veredito.');
});

test('translateSuggestionReason normalizes legacy path reason', () => {
  const raw = 'Caminho contém "watch"';
  const translated = translateSuggestionReason(raw, createTranslator());
  assert.equal(translated, 'O caminho "watch" entrou no radar.');
});

test('translateSuggestionReason parses learned signal reason', () => {
  const raw = 'Sinal aprendido: domínio youtube.com tende a ser procrastinação';
  const translated = translateSuggestionReason(raw, createTranslator());
  assert.equal(
    translated,
    'Meu histórico local já viu domínio youtube.com; isso tem cheiro de procrastinação.'
  );
});

test('translateSuggestionReason parses ML reason and humanizes signal family', () => {
  const raw = 'Sinal: host:youtube.com favorece procrastinação (peso 1.22)';
  const translated = translateSuggestionReason(raw, createTranslator());
  assert.equal(
    translated,
    'Meu radar jurídico pegou o domínio (youtube.com). Isso tem cheiro de procrastinação (impacto forte).'
  );
});
