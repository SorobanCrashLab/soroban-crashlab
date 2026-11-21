/**
 * Policy Tester - Dry-run test cases for policies.
 *
 * Allows testing policies against sample requests before deployment.
 */

import type { PolicyRecord } from './PolicyStore';
import type { PolicyValidationResult } from './PolicyValidator';
import { validatePolicyString } from './PolicyValidator';

// ─── Test Case Types ───────────────────────────────────────────────────────

/**
 * A single test case for policy evaluation.
 */
export interface PolicyTestCase {
  /** Test case ID */
  id: string;
  /** Test description */
  description?: string;
  /** Principal attributes */
  principal: {
    id: string;
    identityType: 'github' | 'api-key' | 'oidc' | 'anonymous';
    identityValue: string;
    role: 'analyst' | 'maintainer' | 'admin';
    teams?: string[];
    groups?: string[];
    riskScore?: number;
  };
  /** Action to evaluate */
  action: string;
  /** Resource being accessed */
  resource: {
    type: 'campaign' | 'run' | 'artifact' | 'network' | 'schedule' | 'token';
    id: string;
    team?: string;
    tags?: string[];
    owner?: string;
  };
  /** Context attributes */
  context?: {
    time?: number;
    ip?: string;
    userAgent?: string;
    mfaVerified?: boolean;
    isDryRun?: boolean;
  };
  /** Expected result: permit or deny */
  expected: 'permit' | 'deny';
  /** Why this test case exists */
  rationale?: string;
}

/**
 * Test file in YAML format.
 */
export interface YamlTestCases {
  policy: string;
  description?: string;
  version?: string;
  tests: PolicyTestCase[];
}

/**
 * Test case execution result.
 */
export interface TestCaseResult {
  /** Test case ID */
  id: string;
  /** Test description */
  description?: string;
  /** Expected result */
  expected: 'permit' | 'deny';
  /** Actual result */
  actual: 'permit' | 'deny';
  /** Whether test passed */
  passed: boolean;
  /** Reason for failure (if any) */
  reason?: string;
  /** Time taken for evaluation in ms */
  durationMs: number;
}

/**
 * Test run result.
 */
export interface PolicyTestResult {
  /** Policy ID tested */
  policyId: string;
  /** Test file or source */
  testSource: string;
  /** Total tests */
  total: number;
  /** Tests passed */
  passed: number;
  /** Tests failed */
  failed: number;
  /** Test results */
  results: TestCaseResult[];
  /** Time taken in ms */
  durationMs: number;
  /** Whether all tests passed */
  success: boolean;
}

// ─── Policy Tester ───────────────────────────────────────────────────────────

/**
 * Tests policies against test cases.
 */
export class PolicyTester {
  /**
   * Run all test cases against a policy.
   */
  async test(policy: PolicyRecord, testCases: PolicyTestCase[]): Promise<PolicyTestResult> {
    const start = Date.now();
    const results: TestCaseResult[] = [];

    // Validate the policy first
    const validation = await validatePolicyString(policy.cedarCode);
    if (!validation.valid) {
      // If policy is invalid, all tests fail
      for (const testCase of testCases) {
        results.push({
          id: testCase.id,
          description: testCase.description,
          expected: testCase.expected,
          actual: 'deny', // Default to deny for invalid policies
          passed: testCase.expected === 'deny',
          reason: 'Policy failed validation',
          durationMs: 0,
        });
      }
      return {
        policyId: policy.id,
        testSource: 'inline-tests',
        total: testCases.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        results,
        durationMs: Date.now() - start,
        success: false,
      };
    }

    // Run each test case
    for (const testCase of testCases) {
      const result = await this.runTest(policy, testCase);
      results.push(result);
    }

    const total = testCases.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;

    return {
      policyId: policy.id,
      testSource: 'inline-tests',
      total,
      passed,
      failed,
      results,
      durationMs: Date.now() - start,
      success: failed === 0,
    };
  }

  /**
   * Run a single test case against a policy.
   */
  private async runTest(policy: PolicyRecord, testCase: PolicyTestCase): Promise<TestCaseResult> {
    const start = Date.now();

    try {
      // Build test context
      const context = this.buildTestContext(testCase);

      // Evaluate policy
      const actual = await this.evaluatePolicy(policy, testCase, context);

      return {
        id: testCase.id,
        description: testCase.description,
        expected: testCase.expected,
        actual,
        passed: actual === testCase.expected,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        id: testCase.id,
        description: testCase.description,
        expected: testCase.expected,
        actual: 'deny',
        passed: testCase.expected === 'deny',
        reason: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Build test context from test case.
   */
  private buildTestContext(testCase: PolicyTestCase) {
    return testCase.context ?? {
      time: Date.now(),
      ip: '127.0.0.1',
      mfaVerified: false,
      isDryRun: true,
    };
  }

  /**
   * Evaluate a policy for a test case.
   * This is a simplified implementation - production would use Cedar SDK properly.
   */
  private async evaluatePolicy(policy: PolicyRecord, testCase: PolicyTestCase, context: { time?: number; ip?: string; mfaVerified?: boolean; userAgent?: string; isDryRun?: boolean }): Promise<'permit' | 'deny'> {
    const code = policy.cedarCode;
    const { principal, action, resource } = testCase;

    // Check for admin bypass
    if (principal.role === 'admin') {
      return 'permit';
    }

    // Simple pattern matching for demonstration
    // In production, this would use the actual Cedar evaluator

    // Check role-based permissions
    if (code.includes(`principal.role == "maintainer"`)) {
      if (principal.role === 'maintainer') return 'permit';
    }

    if (code.includes(`principal.role == "analyst`)) {
      if (principal.role === 'analyst') {
        if (action === 'view' || action === 'annotate' || action === 'triage') {
          return 'permit';
        }
      }
    }

    // Check team ownership
    const teamMatch = code.match(/principal\.team\s*==\s*resource\.team/);
    if (teamMatch && resource.team) {
      const principalTeams = principal.teams ?? [];
      if (principalTeams.includes(resource.team)) {
        return 'permit';
      }
    }

    // Check resource access patterns
    const resourceIdMatch = code.match(/resource\.id\s*==\s*"(\w+)"/g);
    if (resourceIdMatch) {
      for (const match of resourceIdMatch) {
        if (match.includes(resource.id)) {
          return 'permit';
        }
      }
    }

    // Default: check for general permit without conditions
    if (code.includes('permit') && !code.includes('when')) {
      return 'permit';
    }

    return 'deny';
  }

  /**
   * Test multiple policies against multiple test cases.
   */
  async testSuite(policies: PolicyRecord[], testCases: PolicyTestCase[]): Promise<PolicyTestResult[]> {
    const results: PolicyTestResult[] = [];

    for (const policy of policies) {
      const result = await this.test(policy, testCases);
      results.push(result);
    }

    return results;
  }

  /**
   * Test a policy with file-based test cases (YAML format).
   */
  async testFromFile(policy: PolicyRecord, yamlContent: string): Promise<PolicyTestResult> {
    const testCases = this.parseYaml(yamlContent);
    return this.test(policy, testCases);
  }

  /**
   * Parse YAML test cases.
   */
  private parseYaml(content: string): PolicyTestCase[] {
    // Simple YAML parser for test cases
    // In production, would use js-yaml or similar
    const testCases: PolicyTestCase[] = [];
    const lines = content.split('\n');

    let currentCase: PolicyTestCase | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Start of a new test case
      if (trimmed.startsWith('test:')) {
        if (currentCase) {
          testCases.push(currentCase);
        }
        currentCase = {
          id: trimmed.substring(5).trim(),
          principal: { id: '', identityType: 'anonymous', identityValue: '', role: 'analyst' },
          action: '',
          resource: { type: 'run', id: '' },
          expected: 'permit',
        };
        continue;
      }

      if (currentCase) {
        // Parse nested properties
        if (trimmed.startsWith('principal:')) {
          // This would be nested YAML
        } else if (trimmed.startsWith('action:')) {
          currentCase.action = trimmed.substring(7).trim().replace(/"/g, '');
        } else if (trimmed.startsWith('expected:')) {
          currentCase.expected = trimmed.substring(9).trim().replace(/"/g, '') as 'permit' | 'deny';
        }
      }
    }

    if (currentCase) {
      testCases.push(currentCase);
    }

    return testCases;
  }

  /**
   * Generate a test report.
   */
  generateReport(results: PolicyTestResult[]): string {
    const header = '# Policy Test Report\n\n';
    const summary = `## Summary\n\n`;

    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    const policySections: string[] = [];

    for (const result of results) {
      totalTests += result.total;
      totalPassed += result.passed;
      totalFailed += result.failed;

      const policySection = `
### Policy: ${result.policyId}

- **Duration**: ${result.durationMs}ms
- **Passed**: ${result.passed}/${result.total}
- **Success**: ${result.success ? '✅' : '❌'}

| Test ID | Expected | Actual | Result |
|---------|----------|--------|--------|
${result.results.map(r => `| ${r.id} | ${r.expected} | ${r.actual} | ${r.passed ? '✅' : '❌'} |`).join('\n')}
`;
      policySections.push(policySection);
    }

    const footer = `
## Summary

- **Total Tests**: ${totalTests}
- **Passed**: ${totalPassed}
- **Failed**: ${totalFailed}
- **Overall Success**: ${totalFailed === 0 ? '✅' : '❌'}
`;

    return header + summary + policySections.join('\n') + footer;
  }
}

// ─── Test Case Generator ───────────────────────────────────────────────────

/**
 * Generates test cases for common policy patterns.
 */
export class TestCaseGenerator {
  /**
   * Generate test cases for role-based policies.
   */
  generateRoleTests(role: 'analyst' | 'maintainer' | 'admin', actions: string[]): PolicyTestCase[] {
    const tests: PolicyTestCase[] = [];
    const roleHierarchy = { analyst: 1, maintainer: 2, admin: 3 };
    const currentLevel = roleHierarchy[role];

    for (const action of actions) {
      const expected = currentLevel >= 2 ? 'permit' : 'deny';
      tests.push({
        id: `role-${role}-${action}`,
        description: `Test ${role} role for ${action} action`,
        principal: {
          id: `user-${role}`,
          identityType: 'github',
          identityValue: `test-${role}`,
          role,
          teams: ['security'],
        },
        action,
        resource: {
          type: 'run',
          id: 'run-123',
        },
        expected,
        rationale: `${role} should ${expected} ${action}`,
      });
    }

    return tests;
  }

  /**
   * Generate test cases for team-based resource ownership.
   */
  generateTeamOwnershipTests(): PolicyTestCase[] {
    const tests: PolicyTestCase[] = [];

    // User on the same team
    tests.push({
      id: 'team-same-owner',
      description: 'User on same team owns resource',
      principal: {
        id: 'user-alice',
        identityType: 'github',
        identityValue: 'alice',
        role: 'analyst',
        teams: ['security'],
      },
      action: 'view',
      resource: {
        type: 'campaign',
        id: 'campaign-1',
        team: 'security',
      },
      expected: 'permit',
    });

    // User on different team
    tests.push({
      id: 'team-different',
      description: 'User on different team',
      principal: {
        id: 'user-bob',
        identityType: 'github',
        identityValue: 'bob',
        role: 'analyst',
        teams: ['dev'],
      },
      action: 'view',
      resource: {
        type: 'campaign',
        id: 'campaign-1',
        team: 'security',
      },
      expected: 'deny',
    });

    return tests;
  }

  /**
   * Generate test cases for time-based policies.
   */
  generateTimeBasedTests(): PolicyTestCase[] {
    const tests: PolicyTestCase[] = [];

    // During business hours (09:00-18:00)
    tests.push({
      id: 'time-business-hours',
      description: 'Request during business hours',
      principal: {
        id: 'user-charlie',
        identityType: 'github',
        identityValue: 'charlie',
        role: 'analyst',
      },
      action: 'view',
      resource: {
        type: 'run',
        id: 'run-456',
      },
      context: {
        time: new Date('2024-01-15T14:00:00Z').getTime(), // 14:00 UTC
      },
      expected: 'permit',
    });

    // Outside business hours
    tests.push({
      id: 'time-outside-hours',
      description: 'Request outside business hours',
      principal: {
        id: 'user-charlie',
        identityType: 'github',
        identityValue: 'charlie',
        role: 'analyst',
      },
      action: 'view',
      resource: {
        type: 'run',
        id: 'run-456',
      },
      context: {
        time: new Date('2024-01-15T21:00:00Z').getTime(), // 21:00 UTC
      },
      expected: 'deny',
    });

    return tests;
  }
}

// ─── Export Factory Function ────────────────────────────────────────────────

/**
 * Create a policy tester.
 */
export function createPolicyTester(): PolicyTester {
  return new PolicyTester();
}

/**
 * Create a test case generator.
 */
export function createTestCaseGenerator(): TestCaseGenerator {
  return new TestCaseGenerator();
}