// TypeScript Reproducer Snippet Generator
// This module exports a function to generate a TypeScript snippet for reproducing a failing web test case.
// The snippet includes dependencies and an assertion template.


export interface ReproducerInput<TInput = unknown, TExpected = unknown, TActual = unknown> {
  testName: string;
  input: TInput;
  expected: TExpected;
  actual: TActual;
  dependencies?: string[];
}

export function generateTSReproducer<TInput = unknown, TExpected = unknown, TActual = unknown>({ testName, input, expected, actual, dependencies = [] }: ReproducerInput<TInput, TExpected, TActual>): string {
  const deps = dependencies.length
    ? dependencies.map(dep => `import ${dep} from '${dep}';`).join('\n') + '\n\n'
    : '';
  return `// Reproducer for: ${testName}
// Dependencies: ${dependencies.join(', ') || 'none'}
${deps}describe('${testName}', () => {
  it('should reproduce the failure', () => {
    const input = ${JSON.stringify(input, null, 2)};
    // Replace with actual function call
    const result = /* call function with input */;
    // Expected: ${JSON.stringify(expected)}
    // Actual: ${JSON.stringify(actual)}
    expect(result).toEqual(${JSON.stringify(expected, null, 2)});
  });
});
`;
}
