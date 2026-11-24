// WIP scaffold for issue #2280. No consent/privacy-control UI yet — sampling only.

export function shouldSample(rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return Math.random() < rate;
}
