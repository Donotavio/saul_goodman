/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReasonText, translateSuggestionReason } from '../shared/utils/suggestion-reasons.js';

test('sanitizeReasonText escapes HTML fragments', () => {
  const input = '<img src=x onerror=alert(1)>';
  const escaped = sanitizeReasonText(input);
  assert.equal(escaped.includes('<'), false);
  assert.ok(escaped.includes('&lt;img'));
});

test('translateSuggestionReason keeps unknown text as-is', () => {
  const raw = 'Palavra-chave "video" em titulo';
  const translated = translateSuggestionReason(raw, (key) => key);
  assert.ok(typeof translated === 'string');
});

test('translateSuggestionReason decodes HTML entities before matching', () => {
  const raw = 'Palavra-chave &quot;dashboard&quot; em título';
  const translated = translateSuggestionReason(raw, (key, substitutions) => {
    const tokens = (substitutions ?? {}) as Record<string, string | number>;
    if (key === 'suggestion_reason_source_title') {
      return 'título';
    }
    if (key === 'suggestion_reason_keyword') {
      return `Palavra-chave "${tokens.keyword ?? ''}" em ${tokens.source ?? ''}`;
    }
    return key;
  });
  assert.equal(translated, 'Palavra-chave "dashboard" em título');
});
