/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitDurationByHour } from '../shared/utils/time.js';

test('BUG: splitDurationByHour não deve adicionar tempo futuro', () => {
  // Cenário: são 7:08 da manhã
  const now = new Date(2026, 0, 20, 7, 8, 0);
  const nowMs = now.getTime();
  
  // Sessão que começou às 7:00 e ainda está ativa (vai "terminar" às 7:30)
  const sessionStart = new Date(2026, 0, 20, 7, 0, 0).getTime();
  const futureEnd = new Date(2026, 0, 20, 7, 30, 0).getTime();
  const futureDuration = futureEnd - sessionStart; // 30 minutos
  
  console.log('Agora:', now.toLocaleString('pt-BR'));
  console.log('Início da sessão:', new Date(sessionStart).toLocaleString('pt-BR'));
  console.log('Duração total:', futureDuration / 60000, 'minutos');
  
  // Se splitDurationByHour recebe uma duração futura, vai adicionar tempo que não aconteceu ainda
  const segments = splitDurationByHour(sessionStart, futureDuration);
  
  console.log('Segmentos gerados:', segments);
  
  const totalMinutes = segments.reduce((acc, s) => acc + s.milliseconds, 0) / 60000;
  console.log('Total acumulado:', totalMinutes, 'minutos');
  
  // BUG: isso vai acumular 30 minutos mesmo sendo 7:08
  assert.ok(totalMinutes === 30, 'splitDurationByHour não valida tempo futuro!');
});

test('Reprodução exata: 35 minutos às 7:08', () => {
  const now = new Date(2026, 0, 20, 7, 8, 0);
  
  // Possíveis sessões que somam ~35 minutos
  const sessions = [
    { start: new Date(2026, 0, 20, 7, 0, 0).getTime(), duration: 30 * 60 * 1000 }, // 30min
    { start: new Date(2026, 0, 20, 7, 5, 0).getTime(), duration: 10 * 60 * 1000 }  // 10min (parcial)
  ];
  
  let totalHour7 = 0;
  
  for (const session of sessions) {
    const segments = splitDurationByHour(session.start, session.duration);
    for (const segment of segments) {
      if (segment.hour === 7) {
        totalHour7 += segment.milliseconds;
      }
    }
  }
  
  console.log('\n=== Reprodução do bug ===');
  console.log('Hora atual:', now.toLocaleString('pt-BR'));
  console.log('Total acumulado na hora 7:', totalHour7 / 60000, 'minutos');
  console.log('Máximo permitido (7:00-7:08):', 8, 'minutos');
  
  // Demonstra o bug: acumula mais tempo do que transcorreu
  assert.ok(totalHour7 > 8 * 60 * 1000, 'Bug confirmado: acumula tempo futuro');
});

test('Solução: validar que endTime não ultrapassa "agora"', () => {
  const now = new Date(2026, 0, 20, 7, 8, 0).getTime();
  
  // Sessão ativa que começou às 7:00
  const sessionStart = new Date(2026, 0, 20, 7, 0, 0).getTime();
  const projectedDuration = 30 * 60 * 1000; // Estimativa de 30min
  
  // CORREÇÃO: clipar a duração para não ultrapassar "agora"
  const actualDuration = Math.min(projectedDuration, now - sessionStart);
  
  const segments = splitDurationByHour(sessionStart, actualDuration);
  const totalHour7 = segments
    .filter(s => s.hour === 7)
    .reduce((acc, s) => acc + s.milliseconds, 0);
  
  console.log('\n=== Com correção ===');
  console.log('Duração projetada:', projectedDuration / 60000, 'minutos');
  console.log('Duração real (até agora):', actualDuration / 60000, 'minutos');
  console.log('Acumulado na hora 7:', totalHour7 / 60000, 'minutos');
  
  assert.equal(totalHour7, 8 * 60 * 1000, 'Deve acumular apenas 8 minutos (7:00-7:08)');
});
