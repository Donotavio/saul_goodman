import {
  CRITICAL_SOUND_PREFERENCE_KEY,
  loadBooleanPreference,
  saveBooleanPreference
} from '../shared/preferences.js';

async function run(): Promise<void> {
  const globalScope = globalThis as { __saulFallbackPrefs__?: Record<string, boolean> };
  if (globalScope.__saulFallbackPrefs__) {
    globalScope.__saulFallbackPrefs__ = {};
  }

  const initial = await loadBooleanPreference(CRITICAL_SOUND_PREFERENCE_KEY);
  if (initial !== undefined) {
    throw new Error('Esperava preferência indefinida ao iniciar o teste.');
  }

  await saveBooleanPreference(CRITICAL_SOUND_PREFERENCE_KEY, true);
  const first = await loadBooleanPreference(CRITICAL_SOUND_PREFERENCE_KEY);
  if (first !== true) {
    throw new Error('Falha ao persistir valor true na preferência crítica.');
  }

  await saveBooleanPreference(CRITICAL_SOUND_PREFERENCE_KEY, false);
  const second = await loadBooleanPreference(CRITICAL_SOUND_PREFERENCE_KEY);
  if (second !== false) {
    throw new Error('Falha ao atualizar valor para false na preferência crítica.');
  }

  console.log('Teste de preferência crítica executado com sucesso.');
}

run().catch((error) => {
  console.error(error);
  throw error;
});
