declare module 'node:test' {
  type TestFunction = (t?: {
    diagnostic?: (message: string) => void;
    plan?: (count: number) => void;
  }) => void | Promise<void>;

  interface Test {
    (name: string, fn: TestFunction): void;
    (fn: TestFunction): void;
  }

  const test: Test;
  export = test;
}

declare module 'node:assert/strict' {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
  };
  export = assert;
}
