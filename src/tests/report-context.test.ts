/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';

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
}

function createElementStub(id: string): any {
  return {
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    hidden: false,
    className: '',
    style: {},
    children: [] as any[],
    classList: new FakeClassList(),
    appendChild(child: any) {
      this.children.push(child);
      return child;
    },
    querySelector() {
      return createElementStub(`${id}-query`);
    },
    addEventListener() {},
    removeEventListener() {},
    contains() {
      return false;
    },
    setAttribute() {},
    removeAttribute() {}
  };
}

function createTableBodyStub(): any {
  const body = createElementStub('contextBreakdownTable-body');
  let html = '';
  Object.defineProperty(body, 'innerHTML', {
    get() {
      return html;
    },
    set(value: string) {
      html = value;
      body.children = [];
    }
  });
  return body;
}

function getElement(id: string): any {
  if (!elementStore.has(id)) {
    elementStore.set(id, createElementStub(id));
  }
  return elementStore.get(id);
}

const contextSectionStub = createElementStub('contextBreakdownSection');
contextSectionStub.hidden = true;
contextSectionStub.classList.add('hidden');
elementStore.set('contextBreakdownSection', contextSectionStub);

const contextBodyStub = createTableBodyStub();
elementStore.set('contextBreakdownTable-body', contextBodyStub);

const contextTableStub = {
  id: 'contextBreakdownTable',
  querySelector(selector: string) {
    if (selector === 'tbody') {
      return contextBodyStub;
    }
    return createElementStub(`${this.id}-${selector}`);
  }
};
elementStore.set('contextBreakdownTable', contextTableStub);

(globalThis as any).window = globalThis;
(globalThis as any).alert = () => {};
(globalThis as any).document = {
  body: createElementStub('body'),
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
(globalThis as any).document.body.classList = new FakeClassList();

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

test('renderContextBreakdown fills table with formatted values', async () => {
  const report = await reportModulePromise;
  const durations = {
    work: 10 * 60 * 1000,
    personal: 0,
    leisure: 2 * 60 * 1000,
    study: 3 * 60 * 1000,
    dayOff: 0,
    vacation: 0
  };
  const indices = { work: 55, personal: 0, leisure: 40, study: 35, dayOff: 0, vacation: 0 };
  report.renderContextBreakdown(durations, indices);

  assert.equal(contextSectionStub.hidden, false);
  assert.equal(contextSectionStub.classList.contains('hidden'), false);
  assert.equal(contextBodyStub.children.length, 6);

  const workRow = contextBodyStub.children[0];
  const personalRow = contextBodyStub.children[1];
  const leisureRow = contextBodyStub.children[2];
  const studyRow = contextBodyStub.children[3];
  const dayOffRow = contextBodyStub.children[4];
  const vacationRow = contextBodyStub.children[5];

  assert.equal(workRow.children[0].textContent, 'work');
  assert.equal(workRow.children[1].textContent, '10m');
  assert.equal(workRow.children[2].textContent, '55%');
  assert.equal(personalRow.children[1].textContent, '0s');
  assert.equal(personalRow.children[2].textContent, '0%');
  assert.equal(leisureRow.children[2].textContent, '40%');
  assert.equal(studyRow.children[2].textContent, '35%');
  assert.equal(dayOffRow.children[2].textContent, '0%');
  assert.equal(vacationRow.children[2].textContent, '0%');
});

test('renderContextBreakdown hides section when no data is provided', async () => {
  const report = await reportModulePromise;
  report.renderContextBreakdown(undefined, undefined);

  assert.equal(contextSectionStub.hidden, true);
  assert.equal(contextSectionStub.classList.contains('hidden'), true);
  assert.equal(contextBodyStub.children.length, 0);
});
