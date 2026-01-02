/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultMetrics } from '../shared/storage.js';
import type { FairnessSummary } from '../shared/types.js';

const elementStore = new Map<string, any>();

class FakeClassList {
  private classes = new Set<string>();

  add(...tokens: string[]): void {
    tokens.forEach((token) => this.classes.add(token));
  }

  remove(...tokens: string[]): void {
    tokens.forEach((token) => this.classes.delete(token));
  }

  contains(token: string): boolean {
    return this.classes.has(token);
  }

  toggle(token: string, force?: boolean): void {
    if (force === undefined) {
      if (this.contains(token)) {
        this.remove(token);
      } else {
        this.add(token);
      }
      return;
    }
    if (force) {
      this.add(token);
    } else {
      this.remove(token);
    }
  }
}

function createElementStub(id: string): any {
  const stub: any = {
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    checked: false,
    hidden: false,
    style: {},
    classList: new FakeClassList(),
    addEventListener() {},
    removeEventListener() {},
    appendChild() {
      return createElementStub(`${id}-child`);
    },
    querySelector() {
      return createElementStub(`${id}-query`);
    },
    querySelectorAll() {
      return [];
    },
    contains() {
      return false;
    },
    setAttribute() {},
    removeAttribute() {},
    getContext() {
      return {
        canvas: {},
        fillRect() {},
        clearRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        closePath() {},
        arc() {},
        fill() {},
        strokeRect() {}
      };
    },
    toBase64Image() {
      return '';
    }
  };
  return stub;
}

function getElement(id: string): any {
  if (!elementStore.has(id)) {
    elementStore.set(id, createElementStub(id));
  }
  return elementStore.get(id);
}

(globalThis as any).window = globalThis;
(globalThis as any).alert = () => {};
(globalThis as any).document = {
  getElementById(id: string) {
    return getElement(id);
  },
  createElement(tag: string) {
    return createElementStub(tag);
  },
  addEventListener() {},
  querySelector() {
    return createElementStub('query');
  }
};

(globalThis as any).chrome = {
  runtime: {
    getURL: () => 'https://example.com',
    sendMessage: () => {}
  },
  tabs: {
    create() {}
  }
};

(globalThis as any).Chart = class {
  destroy(): void {}
  toBase64Image(): string {
    return '';
  }
};

const reportModulePromise = import('../report/report.js');

test('renderFairnessSummary updates status and hides hint when normal override', async () => {
  const report = await reportModulePromise;
  const manual: FairnessSummary = {
    rule: 'manual-override',
    manualOverrideActive: true,
    contextMode: { value: 'work', updatedAt: Date.now() },
    holidayNeutral: false,
    isHolidayToday: false
  };
  report.renderFairnessSummary(manual);
  const statusEl = getElement('fairnessStatusReport');
  assert.equal(statusEl.textContent, 'Dia ignorado manualmente.');
  const hintEl = getElement('fairnessHintReport');
  assert.equal(hintEl.classList.contains('hidden'), true);
});

test('renderFairnessSummary shows holiday hint when neutralized', async () => {
  const report = await reportModulePromise;
  const holiday: FairnessSummary = {
    rule: 'holiday',
    manualOverrideActive: false,
    contextMode: { value: 'work', updatedAt: Date.now() },
    holidayNeutral: true,
    isHolidayToday: true
  };
  report.renderFairnessSummary(holiday);
  const statusEl = getElement('fairnessStatusReport');
  assert.equal(statusEl.textContent, 'Feriado nacional neutralizou o índice.');
  const hintEl = getElement('fairnessHintReport');
  assert.equal(hintEl.classList.contains('hidden'), false);
  assert.equal(hintEl.textContent, 'Hoje é feriado, índice pausado automaticamente.');
});

test('buildShareSummaryText prefixes fairness line when guardrail active', async () => {
  const report = await reportModulePromise;
  const fairness: FairnessSummary = {
    rule: 'context-leisure',
    manualOverrideActive: false,
    contextMode: { value: 'leisure', updatedAt: Date.now() },
    holidayNeutral: false,
    isHolidayToday: false
  };
  const metrics = createDefaultMetrics();
  metrics.currentIndex = 42;
  metrics.tabSwitches = 5;
  getElement('reportDate').textContent = '2 de janeiro de 2024';
  const output = report.buildShareSummaryText(metrics, fairness);
  const firstLine = output.split('\n')[0];
  assert.equal(firstLine, 'Justiça do dia: Modo lazer reduziu as cobranças.');
});

test('exportPdf writes fairness status line', async () => {
  const report = await reportModulePromise;
  const metrics = createDefaultMetrics();
  metrics.currentIndex = 30;
  metrics.tabSwitches = 12;
  getElement('reportDate').textContent = '3 de janeiro de 2024';
  const fairness: FairnessSummary = {
    rule: 'context-personal',
    manualOverrideActive: false,
    contextMode: { value: 'personal', updatedAt: Date.now() },
    holidayNeutral: false,
    isHolidayToday: false
  };

  const textCalls: string[] = [];
  class FakeDoc {
    setFontSize(): void {}
    setFont(): void {}
    text(content: string | string[], _x: number, _y: number): void {
      const value = Array.isArray(content) ? content.join(' ') : content;
      textCalls.push(value);
    }
    addImage(): void {}
    addPage(): void {}
    splitTextToSize(text: string): string[] {
      return [text];
    }
    save(): void {}
  }

  (globalThis as any).jspdf = {
    jsPDF: class {
      constructor() {
        return new FakeDoc();
      }
    }
  };

  report.__setReportTestState({ metrics, fairness });
  await report.exportPdf();

  const fairnessLine = textCalls.find((line) => line.startsWith('Status:'));
  assert.ok(fairnessLine);
  assert.ok(fairnessLine?.includes('Modo pessoal — sem pontuação.'));
});

test('exportPdf renders context and composition pages with fairness reason', async () => {
  const report = await reportModulePromise;
  const metrics = createDefaultMetrics();
  metrics.contextDurations = {
    work: 40000,
    personal: 30000,
    leisure: 20000,
    study: 10000,
    dayOff: 0,
    vacation: 0
  };
  metrics.contextIndices = {
    work: 80,
    personal: 0,
    leisure: 65,
    study: 72,
    dayOff: 0,
    vacation: 0
  };
  metrics.productiveMs = 2 * 3600000;
  metrics.procrastinationMs = 1800000;
  metrics.inactiveMs = 900000;
  metrics.domains['neutral.test'] = {
    domain: 'neutral.test',
    category: 'neutral',
    milliseconds: 300000
  };
  const fairness: FairnessSummary = {
    rule: 'holiday',
    manualOverrideActive: false,
    contextMode: { value: 'work', updatedAt: Date.now() },
    holidayNeutral: true,
    isHolidayToday: true
  };

  const textCalls: string[] = [];
  class FakeDoc {
    setFontSize(): void {}
    setFont(): void {}
    text(content: string | string[], _x: number, _y: number): void {
      const value = Array.isArray(content) ? content.join(' ') : content;
      textCalls.push(value);
    }
    addImage(): void {}
    addPage(): void {}
    splitTextToSize(text: string): string[] {
      return [text];
    }
    save(): void {}
  }

  (globalThis as any).jspdf = {
    jsPDF: class {
      constructor() {
        return new FakeDoc();
      }
    }
  };

  report.__setReportTestState({ metrics, fairness });
  await report.exportPdf();

  const hasContextTitle = textCalls.some((line) => line.includes('Context breakdown'));
  const hasCompositionTitle = textCalls.some((line) => line.includes('Composition summary'));
  assert.equal(hasContextTitle, true);
  assert.equal(hasCompositionTitle, true);
  const reasonLine = textCalls.find((line) => line.includes('Reason:'));
  assert.ok(reasonLine);
  assert.ok(reasonLine?.includes('Holiday'));
});
