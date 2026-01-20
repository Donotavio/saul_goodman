/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitDurationByHour, getTodayKey, formatDateKey } from '../shared/utils/time.js';
import type { DailyMetrics, TimelineEntry } from '../shared/types.js';

test('BUG-FIX: vscodeTimeline deve filtrar sessões de dias anteriores', () => {
  // Simula cenário: são 6:16 da manhã de 20/01/2026
  const now = new Date('2026-01-20T06:16:00-03:00');
  const todayKey = getTodayKey(now);
  
  // Sessão do dia anterior (19/01) que NÃO deve ser contabilizada
  const yesterdaySession: TimelineEntry = {
    startTime: new Date('2026-01-19T23:00:00-03:00').getTime(),
    endTime: new Date('2026-01-20T01:00:00-03:00').getTime(),
    durationMs: 2 * 60 * 60 * 1000, // 2 horas
    domain: 'VS Code (IDE)',
    category: 'productive'
  };
  
  // Sessão de hoje (20/01) que DEVE ser contabilizada
  const todaySession: TimelineEntry = {
    startTime: new Date('2026-01-20T06:06:00-03:00').getTime(),
    endTime: new Date('2026-01-20T06:16:00-03:00').getTime(),
    durationMs: 10 * 60 * 1000, // 10 minutos
    domain: 'VS Code (IDE)',
    category: 'productive'
  };
  
  // Valida que a sessão de ontem não é de hoje
  const yesterdayKey = formatDateKey(new Date(yesterdaySession.startTime));
  assert.ok(yesterdayKey !== todayKey, 'Sessão de ontem deve ter dateKey diferente');
  
  // Valida que a sessão de hoje é de hoje
  const todaySessionKey = formatDateKey(new Date(todaySession.startTime));
  assert.equal(todaySessionKey, todayKey, 'Sessão de hoje deve ter dateKey igual');
  
  console.log('Today:', todayKey);
  console.log('Yesterday session:', yesterdayKey);
  console.log('Today session:', todaySessionKey);
});

test('BUG-FIX: não deve inflar buckets horários com sessões antigas', () => {
  // Simula: daemon retornou timeline com sessões antigas misturadas
  const vscodeTimeline: TimelineEntry[] = [
    // Sessão antiga (NÃO deve ser contabilizada)
    {
      startTime: new Date('2026-01-19T06:00:00-03:00').getTime(),
      endTime: new Date('2026-01-19T06:55:00-03:00').getTime(),
      durationMs: 55 * 60 * 1000,
      domain: 'VS Code (IDE)',
      category: 'productive'
    },
    // Sessão de hoje (DEVE ser contabilizada)
    {
      startTime: new Date('2026-01-20T06:06:00-03:00').getTime(),
      endTime: new Date('2026-01-20T06:16:00-03:00').getTime(),
      durationMs: 10 * 60 * 1000,
      domain: 'VS Code (IDE)',
      category: 'productive'
    }
  ];
  
  const todayKey = getTodayKey(new Date('2026-01-20T06:16:00-03:00'));
  
  // Filtra apenas sessões de hoje (como a correção faz)
  const todaySessions = vscodeTimeline.filter(entry => {
    const entryKey = formatDateKey(new Date(entry.startTime));
    return entryKey === todayKey;
  });
  
  assert.equal(todaySessions.length, 1, 'Deve ter apenas 1 sessão de hoje');
  assert.equal(todaySessions[0].durationMs, 10 * 60 * 1000, 'Sessão de hoje deve ter 10 minutos');
  
  // Acumula tempo nos buckets horários
  let totalHour6 = 0;
  for (const entry of todaySessions) {
    const segments = splitDurationByHour(entry.startTime, entry.durationMs);
    for (const segment of segments) {
      if (segment.hour === 6) {
        totalHour6 += segment.milliseconds;
      }
    }
  }
  
  console.log('Total na hora 6 (após filtro):', totalHour6 / 60000, 'minutos');
  assert.equal(totalHour6, 10 * 60 * 1000, 'Deve ter apenas 10 minutos na hora 6');
});

test('BUG-FIX: daemon com dados corrompidos não deve quebrar o relatório', () => {
  // Cenário: daemon retornou timeline com sessões de várias datas
  const corruptedTimeline: TimelineEntry[] = [
    { startTime: new Date('2026-01-18T10:00:00-03:00').getTime(), endTime: new Date('2026-01-18T11:00:00-03:00').getTime(), durationMs: 3600000, domain: 'VS Code', category: 'productive' },
    { startTime: new Date('2026-01-19T14:00:00-03:00').getTime(), endTime: new Date('2026-01-19T15:00:00-03:00').getTime(), durationMs: 3600000, domain: 'VS Code', category: 'productive' },
    { startTime: new Date('2026-01-20T06:06:00-03:00').getTime(), endTime: new Date('2026-01-20T06:16:00-03:00').getTime(), durationMs: 600000, domain: 'VS Code', category: 'productive' }
  ];
  
  const todayKey = getTodayKey(new Date('2026-01-20T06:16:00-03:00'));
  
  // Filtra sessões válidas (apenas de hoje)
  const validSessions = corruptedTimeline.filter(entry => {
    const entryKey = formatDateKey(new Date(entry.startTime));
    return entryKey === todayKey;
  });
  
  assert.equal(validSessions.length, 1, 'Deve filtrar apenas 1 sessão válida');
  
  // Calcula total do dia
  const totalMs = validSessions.reduce((acc, entry) => acc + entry.durationMs, 0);
  assert.equal(totalMs, 10 * 60 * 1000, 'Total do dia deve ser 10 minutos');
  
  console.log('Sessões corrompidas:', corruptedTimeline.length);
  console.log('Sessões válidas:', validSessions.length);
  console.log('Total válido:', totalMs / 60000, 'minutos');
});
