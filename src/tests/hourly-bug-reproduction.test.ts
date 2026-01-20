/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitDurationByHour } from '../shared/utils/time.js';

test('Bug: não deve acumular mais tempo do que o tempo decorrido na hora atual', () => {
    // Simula: são 6:16 da manhã (16 minutos passados desde 6:00)
    const now = new Date('2026-01-20T06:16:00-03:00');
    const nowTimestamp = now.getTime();
    
    // Simula uma sessão que começou há 10 minutos (6:06) e termina agora (6:16)
    const sessionStart = nowTimestamp - (10 * 60 * 1000);
    const duration = 10 * 60 * 1000; // 10 minutos
    
    const segments = splitDurationByHour(sessionStart, duration);
    
    console.log('Hora atual:', now.toLocaleString('pt-BR'));
    console.log('Início da sessão:', new Date(sessionStart).toLocaleString('pt-BR'));
    console.log('Duração da sessão:', duration / 60000, 'minutos');
    console.log('Segmentos retornados:', segments);
    
    // Deve ter apenas 1 segmento (tudo na hora 6)
    assert.equal(segments.length, 1, 'Deve ter apenas 1 segmento');
    
    // O segmento deve ser da hora 6
    assert.equal(segments[0].hour, 6, 'Deve ser da hora 6');
    
    // O segmento deve ter exatamente 10 minutos
    assert.equal(segments[0].milliseconds, 10 * 60 * 1000, 'Deve ter 10 minutos');
  });

test('deve lidar corretamente com sessões que atravessam a virada de hora', () => {
    // Sessão que começa às 5:50 e termina às 6:10 (20 minutos no total)
    const sessionEnd = new Date('2026-01-20T06:10:00-03:00');
    const sessionStart = new Date('2026-01-20T05:50:00-03:00');
    const duration = sessionEnd.getTime() - sessionStart.getTime(); // 20 minutos
    
    const segments = splitDurationByHour(sessionStart.getTime(), duration);
    
    console.log('\n=== Teste de virada de hora ===');
    console.log('Início:', sessionStart.toLocaleString('pt-BR'));
    console.log('Fim:', sessionEnd.toLocaleString('pt-BR'));
    console.log('Duração total:', duration / 60000, 'minutos');
    console.log('Segmentos:', segments);
    
    // Deve ter 2 segmentos
    assert.equal(segments.length, 2, 'Deve ter 2 segmentos (hora 5 e hora 6)');
    
    // Primeiro segmento: 10 minutos na hora 5 (5:50 até 6:00)
    assert.equal(segments[0].hour, 5, 'Primeiro segmento deve ser hora 5');
    assert.equal(segments[0].milliseconds, 10 * 60 * 1000, 'Deve ter 10 minutos na hora 5');
    
    // Segundo segmento: 10 minutos na hora 6 (6:00 até 6:10)
    assert.equal(segments[1].hour, 6, 'Segundo segmento deve ser hora 6');
    assert.equal(segments[1].milliseconds, 10 * 60 * 1000, 'Deve ter 10 minutos na hora 6');
  });

test('deve acumular múltiplas sessões corretamente sem duplicar tempo', () => {
    // Simula múltiplas sessões pequenas durante a manhã
    const sessions = [
      { start: new Date('2026-01-20T06:00:00-03:00'), duration: 5 * 60 * 1000 }, // 5 min
      { start: new Date('2026-01-20T06:06:00-03:00'), duration: 5 * 60 * 1000 }, // 5 min
      { start: new Date('2026-01-20T06:12:00-03:00'), duration: 4 * 60 * 1000 }  // 4 min
    ];
    
    let totalHour6 = 0;
    
    for (const session of sessions) {
      const segments = splitDurationByHour(session.start.getTime(), session.duration);
      for (const segment of segments) {
        if (segment.hour === 6) {
          totalHour6 += segment.milliseconds;
        }
      }
    }
    
    console.log('\n=== Teste de múltiplas sessões ===');
    console.log('Total acumulado na hora 6:', totalHour6 / 60000, 'minutos');
    
    // Deve ter exatamente 14 minutos (5 + 5 + 4)
    assert.equal(totalHour6, 14 * 60 * 1000, 'Deve ter 14 minutos no total');
  });

test('deve reproduzir o bug: 55 minutos às 6:16 da manhã', () => {
    // Cenário: usuário relata 55 minutos produtivos às 6:16 da manhã
    // Possível causa: alguma sessão da madrugada ou dia anterior sendo contabilizada
    
    const now = new Date('2026-01-20T06:16:00-03:00');
    
    // Hipótese: uma sessão longa da madrugada está sendo contabilizada errada
    // Por exemplo: sessão de 23:00 de ontem até 1:00 de hoje
    const midnightSession = {
      start: new Date('2026-01-19T23:00:00-03:00').getTime(),
      duration: 2 * 60 * 60 * 1000 // 2 horas
    };
    
    const segments = splitDurationByHour(midnightSession.start, midnightSession.duration);
    
    console.log('\n=== Reprodução do bug ===');
    console.log('Sessão da meia-noite:', new Date(midnightSession.start).toLocaleString('pt-BR'));
    console.log('Duração:', midnightSession.duration / 3600000, 'horas');
    console.log('Segmentos gerados:', segments);
    
    // Verificar se algum segmento está na hora 6 (não deveria!)
    const hour6Segment = segments.find(s => s.hour === 6);
    assert.equal(hour6Segment, undefined, 'NÃO deve haver segmento na hora 6');
});
