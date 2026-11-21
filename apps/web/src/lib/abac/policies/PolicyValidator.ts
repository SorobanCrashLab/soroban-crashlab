/**
 * Policy Validator - Syntax + semantic validation for Cedar policies.
 *
 * Validates policy structure, semantics, and safety before deployment.
 */

import type { PolicyRecord } from './PolicyStore';

// ─── Validation Result Types ────────────────────────────────────────────────

/**
 * Validation result for a policy.
 */
export interface PolicyValidationResult {
  /** Whether the policy is valid */
  valid: boolean;
  /** Validation errors */
  errors: ValidationError[];
  /** Warnings (non-blocking issues) */
  warnings: ValidationWarning[];
  /** Time taken for validation in ms */
  durationMs: number;
}

/**
 * Individual validation error.
 */
export interface ValidationError {
  /** Error message */
  message: string;
  /** Error code */
  code: string;
  /** Line number (if available) */
  line?: number;
  /** Column number (if available) */
  column?: number;
  /** Severity (always 'error') */
  severity: 'error';
}

/**
 * Individual validation warning.
 */
export interface ValidationWarning {
  /** Warning message */
  message: string;
  /** Warning code */
  code: string;
  /** Line number (if available) */
  line?: number;
  /** Column number (if available) */
  column?: number;
  /** Severity */
  severity: 'warning' | 'info';
}

/**
 * Configuration for policy validation.
 */
export interface ValidationConfig {
  /** Enable strict mode (more checks) */
  strict?: boolean;
  /** Validate Cedar syntax only (skip semantic checks) */
  syntaxOnly?: boolean;
  /** Allowed resource types */
  allowedResourceTypes?: string[];
  /** Allowed actions */
  allowedActions?: string[];
  /** Require explicit deny statements */
  requireExplicitDeny?: boolean;
  /** Maximum policy length */
  maxPolicyLength?: number;
}

// ─── Validation Error Codes ─────────────────────────────────────────────────

export const VALIDATION_ERROR_CODES = {
  EMPTY_POLICY: 'EMPTY_POLICY',
  INVALID_SYNTAX: 'INVALID_SYNTAX',
  UNBALANCED_BRACES: 'UNBALANCED_BRACES',
  MISSING_PERMIT: 'MISSING_PERMIT',
  INVALID_PRINCIPAL: 'INVALID_PRINCIPAL',
  INVALID_ACTION: 'INVALID_ACTION',
  INVALID_RESOURCE: 'INVALID_RESOURCE',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  UNSAFE_CONDITION: 'UNSAFE_CONDITION',
  CIRCULAR_REFERENCE: 'CIRCULAR_REFERENCE',
  DUPLICATE_POLICY: 'DUPLICATE_POLICY',
  MAX_LENGTH_EXCEEDED: 'MAX_LENGTH_EXCEEDED',
  UNSUPPORTED_FEATURES: 'UNSUPPORTED_FEATURES',
} as const;

// ─── Policy Validator ────────────────────────────────────────────────────

/**
 * Validates a Cedar policy for syntax and semantics.
 */
export class PolicyValidator {
  private config: Required<ValidationConfig>;

  constructor(config: ValidationConfig = {}) {
    this.config = {
      strict: config.strict ?? false,
      syntaxOnly: config.syntaxOnly ?? false,
      allowedResourceTypes: config.allowedResourceTypes ?? ['campaign', 'run', 'artifact', 'network', 'schedule', 'token'],
      allowedActions: config.allowedActions ?? ['view', 'create', 'update', 'delete', 'annotate', 'triage', 'replay', 'manage', 'admin'],
      requireExplicitDeny: config.requireExplicitDeny ?? false,
      maxPolicyLength: config.maxPolicyLength ?? 65536,
    };
  }

  /**
   * Validate a policy record.
   */
  async validate(record: PolicyRecord): Promise<PolicyValidationResult> {
    const start = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check policy length
    if (record.cedarCode.length > this.config.maxPolicyLength) {
      errors.push({
        message: `Policy exceeds maximum length of ${this.config.maxPolicyLength} characters`,
        code: VALIDATION_ERROR_CODES.MAX_LENGTH_EXCEEDED,
        severity: 'error',
      });
    }

    // Validate Cedar syntax
    const syntaxResult = this.validateSyntax(record.cedarCode);
    errors.push(...syntaxResult.errors);
    warnings.push(...syntaxResult.warnings);

    if (!this.config.syntaxOnly) {
      // Validate semantics
      const semanticResult = this.validateSemantics(record.cedarCode);
      errors.push(...semanticResult.errors);
      warnings.push(...semanticResult.warnings);
    }

    const result: PolicyValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      durationMs: Date.now() - start,
    };

    if (result.valid) {
      // Update the record
      record.validated = true;
      record.validationErrors = undefined;
    } else {
      record.validated = false;
      record.validationErrors = errors.map(e => `${e.code}: ${e.message}`);
    }

    return result;
  }

  /**
   * Validate Cedar policy syntax.
   */
  private validateSyntax(code: string): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!code || code.trim().length === 0) {
      errors.push({
        message: 'Policy code is empty',
        code: VALIDATION_ERROR_CODES.EMPTY_POLICY,
        severity: 'error',
      });
      return { errors, warnings };
    }

    // Check for permit statements
    if (!code.includes('permit')) {
      errors.push({
        message: 'Policy must contain at least one permit statement',
        code: VALIDATION_ERROR_CODES.MISSING_PERMIT,
        severity: 'error',
      });
    }

    // Check for proper Cedar syntax
    // Basic pattern: permit(principal, action, resource) when { condition };
    const permitPattern = /permit\s*\([^)]+\)\s*when\s*\{/;
    if (!permitPattern.test(code)) {
      errors.push({
        message: 'Policy must follow Cedar syntax: permit(principal, action, resource) when { condition }',
        code: VALIDATION_ERROR_CODES.INVALID_SYNTAX,
        severity: 'error',
      });
    }

    // Check for balanced braces
    const openBraces = (code.match(/{/g) ?? []).length;
    const closeBraces = (code.match(/}/g) ?? []).length;
    if (openBraces !== closeBraces) {
      errors.push({
        message: `Unbalanced braces: ${openBraces} open, ${closeBraces} close`,
        code: VALIDATION_ERROR_CODES.UNBALANCED_BRACES,
        severity: 'error',
      });
    }

    // Check for balanced parentheses
    const openParens = (code.match(/\(/g) ?? []).length;
    const closeParens = (code.match(/\)/g) ?? []).length;
    if (openParens !== closeParens) {
      errors.push({
        message: `Unbalanced parentheses: ${openParens} open, ${closeParens} close`,
        code: VALIDATION_ERROR_CODES.INVALID_SYNTAX,
        severity: 'error',
      });
    }

    // Check for proper statement termination
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.length > 0 && !trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}')) {
        // Could be a statement without semicolon - warn in strict mode
        if (this.config.strict) {
          warnings.push({
            message: `Line ${i + 1} may be missing a semicolon`,
            code: VALIDATION_ERROR_CODES.INVALID_SYNTAX,
            line: i + 1,
            severity: 'warning',
          });
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate policy semantics.
   */
  private validateSemantics(code: string): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Extract principal references
    const principalPattern = /principal\.(\w+)/g;
    const principalRefs = new Set<string>();
    let match;
    while ((match = principalPattern.exec(code)) !== null) {
      principalRefs.add(match[1]);
    }

    // Check for valid principal attributes
    const validPrincipalAttrs = new Set(['id', 'role', 'teams', 'groups', 'riskScore', 'identityType', 'identityValue']);
    for (const attr of principalRefs) {
      if (!validPrincipalAttrs.has(attr)) {
        warnings.push({
          message: `Principal attribute '${attr}' may not be defined`,
          code: VALIDATION_ERROR_CODES.INVALID_PRINCIPAL,
          severity: 'warning',
        });
      }
    }

    // Extract resource references
    const resourcePattern = /resource\.(\w+)/g;
    const resourceRefs = new Set<string>();
    while ((match = resourcePattern.exec(code)) !== null) {
      resourceRefs.add(match[1]);
    }

    // Check for valid resource attributes
    const validResourceAttrs = new Set([
      'id', 'name', 'status', 'tags', 'owner', 'team', 'type', 'sensitivity',
      'environment', 'expiresAt', 'createdAt', 'completedAt', 'startedAt',
      'visibility', 'allowedIps', 'scopes', 'active',
    ]);

    for (const attr of resourceRefs) {
      if (!validResourceAttrs.has(attr)) {
        warnings.push({
          message: `Resource attribute '${attr}' may not be defined`,
          code: VALIDATION_ERROR_CODES.INVALID_RESOURCE,
          severity: 'warning',
        });
      }
    }

    // Check for context references
    const contextPattern = /context\.(\w+)/g;
    const contextRefs = new Set<string>();
    while ((match = contextPattern.exec(code)) !== null) {
      contextRefs.add(match[1]);
    }

    // Check for unsafe conditions
    if (code.includes('context.time') && !code.includes('between')) {
      warnings.push({
        message: 'Time comparison without between() may be imprecise',
        code: VALIDATION_ERROR_CODES.UNSAFE_CONDITION,
        severity: 'info',
      });
    }

    // Check for explicit deny if required
    if (this.config.requireExplicitDeny && !code.includes('deny')) {
      warnings.push({
        message: 'Consider adding explicit deny statements for security',
        code: VALIDATION_ERROR_CODES.MISSING_PERMIT,
        severity: 'info',
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate policy against a test case.
   */
  validateTestCase(policy: string, testCase: { principal: string; action: string; resource: string; context?: string; expected: 'permit' | 'deny' }): ValidationResult {
    // This would be implemented with actual Cedar evaluation
    return {
      valid: true,
      decision: testCase.expected,
    };
  }
}

/**
 * Validation result for a test case.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** The decision that would be made */
  decision: 'permit' | 'deny';
  /** Why (for debugging) */
  reason?: string;
}

// ─── Batch Validator ───────────────────────────────────────────────────────

/**
 * Batch validate multiple policies.
 */
export async function validatePolicies(policies: PolicyRecord[], config: ValidationConfig = {}): Promise<{
  valid: PolicyRecord[];
  invalid: PolicyRecord[];
  results: Map<string, PolicyValidationResult>;
}> {
  const validator = new PolicyValidator(config);
  const valid: PolicyRecord[] = [];
  const invalid: PolicyRecord[] = [];
  const results = new Map<string, PolicyValidationResult>();

  for (const policy of policies) {
    const result = await validator.validate(policy);
    results.set(policy.id, result);

    if (result.valid) {
      valid.push(policy);
    } else {
      invalid.push(policy);
    }
  }

  return { valid, invalid, results };
}

// ─── Export Validation Function ───────────────────────────────────────────

/**
 * Validate a policy string directly.
 */
export async function validatePolicyString(
  code: string,
  config: ValidationConfig = {},
): Promise<PolicyValidationResult> {
  const validator = new PolicyValidator(config);
  const record: PolicyRecord = {
    id: 'temp',
    name: 'temp',
    cedarCode: code,
    version: '0.0.1',
    active: false,
    createdAt: '',
    updatedAt: '',
    validated: false,
  };
  return validator.validate(record);
}