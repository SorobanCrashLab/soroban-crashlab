/**
 * Policies - Export all policy-related modules.
 */

export { PolicyStore } from './PolicyStore';
export { selectPolicyStore } from './PolicyStore';
export { validatePolicy } from './PolicyStore';

export {
  PolicyTester,
  TestCaseGenerator,
  createPolicyTester,
  createTestCaseGenerator,
} from './PolicyTester';

export {
  type PolicyTestResult as PolicyTestResultFromTester,
  type TestCaseResult as TestCaseResultFromTester,
  type PolicyTestCase,
} from './PolicyTester';

export {
  validatePolicyString,
  validatePolicies,
  VALIDATION_ERROR_CODES,
} from './PolicyValidator';

export {
  type ValidationError,
  type ValidationWarning,
  type ValidationConfig,
} from './PolicyValidator';

export {
  GitSync,
  type GitOpsConfig,
  type PolicyFile,
  type SyncResult,
  type GitOpsSyncResult,
} from './GitOpsSync';

// Re-export types that are defined in PolicyStore
export type {
  PolicyRecord,
  PolicyMetadata,
  PolicyValidationResult,
  PolicyTestResult,
  TestResultDetail,
} from './PolicyStore';

// Stand-alone function for getting active policy version
export async function getActivePolicyVersion(): Promise<string> {
  const { selectPolicyStore: getStore } = await import('./PolicyStore');
  const store = getStore();
  return store.getActivePolicyVersion();
}