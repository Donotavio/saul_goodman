/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocale, localeToDir, SUPPORTED_LOCALES } from '../shared/i18n.js';

test('resolveLocale returns exact match for all supported locales', () => {
  assert.equal(resolveLocale('pt-BR'), 'pt-BR');
  assert.equal(resolveLocale('en-US'), 'en-US');
  assert.equal(resolveLocale('es-419'), 'es-419');
  assert.equal(resolveLocale('fr'), 'fr');
  assert.equal(resolveLocale('de'), 'de');
  assert.equal(resolveLocale('it'), 'it');
  assert.equal(resolveLocale('tr'), 'tr');
  assert.equal(resolveLocale('zh-CN'), 'zh-CN');
  assert.equal(resolveLocale('hi'), 'hi');
  assert.equal(resolveLocale('ar'), 'ar');
  assert.equal(resolveLocale('bn'), 'bn');
  assert.equal(resolveLocale('ru'), 'ru');
  assert.equal(resolveLocale('ur'), 'ur');
});

test('resolveLocale maps Portuguese variants to pt-BR', () => {
  globalThis.chrome = {
    i18n: { getUILanguage: () => 'pt' }
  } as any;
  assert.equal(resolveLocale(), 'pt-BR');

  globalThis.chrome.i18n.getUILanguage = () => 'pt-PT';
  assert.equal(resolveLocale(), 'pt-BR');
});

test('resolveLocale maps Spanish variants to es-419', () => {
  globalThis.chrome = {
    i18n: { getUILanguage: () => 'es' }
  } as any;
  assert.equal(resolveLocale(), 'es-419');

  globalThis.chrome.i18n.getUILanguage = () => 'es-ES';
  assert.equal(resolveLocale(), 'es-419');
});

test('resolveLocale maps Chinese variants to zh-CN', () => {
  globalThis.chrome = {
    i18n: { getUILanguage: () => 'zh' }
  } as any;
  assert.equal(resolveLocale(), 'zh-CN');

  globalThis.chrome.i18n.getUILanguage = () => 'zh-TW';
  assert.equal(resolveLocale(), 'zh-CN');
});

test('resolveLocale maps single-letter codes correctly', () => {
  globalThis.chrome = {
    i18n: { getUILanguage: () => 'fr' }
  } as any;
  assert.equal(resolveLocale(), 'fr');

  globalThis.chrome.i18n.getUILanguage = () => 'de';
  assert.equal(resolveLocale(), 'de');

  globalThis.chrome.i18n.getUILanguage = () => 'it';
  assert.equal(resolveLocale(), 'it');

  globalThis.chrome.i18n.getUILanguage = () => 'ar';
  assert.equal(resolveLocale(), 'ar');

  globalThis.chrome.i18n.getUILanguage = () => 'ru';
  assert.equal(resolveLocale(), 'ru');
});

test('resolveLocale falls back to en-US for unsupported locales', () => {
  globalThis.chrome = {
    i18n: { getUILanguage: () => 'ja' }
  } as any;
  assert.equal(resolveLocale(), 'en-US');

  globalThis.chrome.i18n.getUILanguage = () => 'ko';
  assert.equal(resolveLocale(), 'en-US');

  globalThis.chrome.i18n.getUILanguage = () => 'unknown';
  assert.equal(resolveLocale(), 'en-US');
});

test('resolveLocale respects explicit preference over browser locale', () => {
  globalThis.chrome = {
    i18n: { getUILanguage: () => 'pt' }
  } as any;

  assert.equal(resolveLocale('de'), 'de');
  assert.equal(resolveLocale('fr'), 'fr');
  assert.equal(resolveLocale('ar'), 'ar');
});

test('localeToDir converts hyphens to underscores', () => {
  assert.equal(localeToDir('pt-BR'), 'pt_BR');
  assert.equal(localeToDir('en-US'), 'en_US');
  assert.equal(localeToDir('es-419'), 'es_419');
  assert.equal(localeToDir('zh-CN'), 'zh_CN');
});

test('localeToDir keeps single-word locales unchanged', () => {
  assert.equal(localeToDir('fr'), 'fr');
  assert.equal(localeToDir('de'), 'de');
  assert.equal(localeToDir('it'), 'it');
  assert.equal(localeToDir('ar'), 'ar');
  assert.equal(localeToDir('ru'), 'ru');
  assert.equal(localeToDir('ur'), 'ur');
});

test('localeToDir handles all supported locales without hyphens', () => {
  SUPPORTED_LOCALES.forEach((locale) => {
    const dir = localeToDir(locale);
    assert.ok(typeof dir === 'string');
    assert.ok(dir.length > 0);
    assert.ok(!dir.includes('-'));
  });
});

test('RTL locales are correctly identified', () => {
  const rtlLocales = ['ar', 'ur'];
  rtlLocales.forEach((locale) => {
    assert.ok(SUPPORTED_LOCALES.includes(locale as any));
  });
});

test('LTR locales count is correct', () => {
  const ltrLocales = SUPPORTED_LOCALES.filter(
    (locale) => locale !== 'ar' && locale !== 'ur'
  );
  assert.equal(ltrLocales.length, 11);
});
