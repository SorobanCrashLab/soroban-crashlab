import { generateTSReproducer } from './generate-ts-reproducer';

describe('generateTSReproducer', () => {
  it('generates a valid TypeScript snippet', () => {
    const snippet = generateTSReproducer({
      testName: 'adds numbers',
      input: { a: 1, b: 2 },
      expected: 3,
      actual: 4,
      dependencies: ['myAddFunction']
    });
    expect(snippet).toContain("describe('adds numbers'");
    expect(snippet).toContain('myAddFunction');
    expect(snippet).toContain('should reproduce the failure');
    expect(snippet).toContain('expect(result).toEqual(3)');
  });
});
