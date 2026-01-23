/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getScoreBand,
  getScoreMessageBand,
  pickScoreMessageKey,
  SCORE_MESSAGE_THRESHOLDS
} from '../shared/score.js';

test('score band thresholds align with message bands', () => {
  const { excellentMax, okMax, warningMax } = SCORE_MESSAGE_THRESHOLDS;

  assert.equal(getScoreMessageBand(excellentMax), 'excellent');
  assert.equal(pickScoreMessageKey(excellentMax), 'popup_score_message_excellent');
  assert.equal(getScoreBand(excellentMax), 'good');

  assert.equal(getScoreMessageBand(okMax), 'ok');
  assert.equal(pickScoreMessageKey(okMax), 'popup_score_message_ok');
  assert.equal(getScoreBand(okMax), 'warn');

  assert.equal(getScoreMessageBand(warningMax), 'warning');
  assert.equal(pickScoreMessageKey(warningMax), 'popup_score_message_warning');
  assert.equal(getScoreBand(warningMax), 'warn');

  assert.equal(getScoreMessageBand(warningMax + 1), 'alert');
  assert.equal(pickScoreMessageKey(warningMax + 1), 'popup_score_message_alert');
  assert.equal(getScoreBand(warningMax + 1), 'alert');
});
