import {
  ONBOARDING_STEPS,
  getProgressPercentage,
} from './onboarding-utils';

console.assert(ONBOARDING_STEPS.length === 5, 'Should have 5 onboarding steps');
console.assert(
  ONBOARDING_STEPS.every(s => s.id && s.title),
  'All steps should have id and title'
);

const steps = ONBOARDING_STEPS.map(s => ({ ...s }));
console.assert(getProgressPercentage(steps) === 0, 'Initial progress should be 0%');

const completed = steps.map((s, i) => ({ ...s, completed: i < 2 }));
console.assert(getProgressPercentage(completed) === 40, 'Progress should be 40% with 2/5 complete');

console.assert(
  ONBOARDING_STEPS.some(s => s.action),
  'Some steps should have actions'
);

console.log('✓ Onboarding utilities tests passed');
