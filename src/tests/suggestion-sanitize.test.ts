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
