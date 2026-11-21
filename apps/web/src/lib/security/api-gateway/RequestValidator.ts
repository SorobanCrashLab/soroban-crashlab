/**
 * API Gateway Hardening — Centralized Request Validator
 *
 * Provides Zod/OpenAPI-driven request validation for all routes with:
 * - Body validation against schemas
 * - Query parameter validation
 * - Header validation
 * - Consistent error responses
 * - Request size limits
 * - Content-Type enforcement
 */

import { z, ZodSchema, ZodError } from 'zod';
import { ValidationConfig, DEFAULT_VALIDATION_CONFIG } from './policies';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationRule {
  /** Schema for request body */
  body?: ZodSchema;
  /** Schema for query parameters */
  query?: ZodSchema;
  /** Schema for headers */
  headers?: ZodSchema;
  /** Schema for path parameters */
  params?: ZodSchema;
  /** Allowed HTTP methods */
  methods?: string[];
  /** Custom validation function */
  custom?: (request: Request) => Promise<ValidationError[]>;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  received?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  data?: {
    body?: unknown;
    query?: unknown;
    headers?: unknown;
    params?: unknown;
  };
}

export interface ValidatedRequest extends Request {
  /** Validated and parsed request data */
  validated?: {
    body?: unknown;
    query?: unknown;
    headers?: unknown;
    params?: unknown;
  };
}

// ─── Default Schemas ──────────────────────────────────────────────────────────

/** Common query parameter schemas */
export const commonQuerySchemas = {
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    cursor: z.string().optional(),
  }),
  sorting: z.object({
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional(),
  }),
  filtering: z.object({
    search: z.string().max(200).optional(),
    filter: z.string().optional(),
  }),
};

/** Common header schemas */
export const commonHeaderSchemas = {
  correlationId: z.object({
    'x-correlation-id': z.string().uuid().optional(),
    'x-request-id': z.string().optional(),
  }),
  apiVersion: z.object({
    'accept-version': z.string().optional(),
    'api-version': z.string().optional(),
  }),
};

// ─── RequestValidator Class ───────────────────────────────────────────────────

export class RequestValidator {
  private config: ValidationConfig;
  private routeRules: Map<string, ValidationRule> = new Map();
  private globalRules: ValidationRule[] = [];

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };
  }

  /**
   * Register validation rules for a route pattern
   * Pattern matches against `${method} ${pathname}`
   */
  registerRoute(pattern: string, rule: ValidationRule): void {
    this.routeRules.set(pattern, rule);
  }

  /**
   * Register global validation rules (applied to all routes)
   */
  registerGlobal(rule: ValidationRule): void {
    this.globalRules.push(rule);
  }

  /**
   * Validate a request against registered rules
   */
  async validate(request: Request): Promise<ValidationResult> {
    const pathname = new URL(request.url).pathname;
    const method = request.method;

    // Find matching route rule
    let routeRule: ValidationRule | undefined;
    for (const [pattern, rule] of this.routeRules.entries()) {
      if (this.matchRoute(pattern, method, pathname)) {
        routeRule = rule;
        break;
      }
    }

    // Collect all applicable rules
    const rules = [...this.globalRules];
    if (routeRule) rules.push(routeRule);

    if (rules.length === 0) {
      return { valid: true, errors: [] };
    }

    const allErrors: ValidationError[] = [];
    const data: ValidationResult['data'] = {};

    // Run basic checks first (size, content-type, etc.)
    const basicErrors = await this.runBasicChecks(request);
    allErrors.push(...basicErrors);

    if (allErrors.length > 0) {
      return { valid: false, errors: allErrors };
    }

    // Parse request body once
    let parsedBody: unknown = undefined;
    const contentType = request.headers.get('content-type') || '';
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(method) && 
      contentType && !contentType.startsWith('multipart/');

    if (hasBody) {
      try {
        const text = await request.clone().text();
        if (text) {
          if (contentType.includes('application/json')) {
            parsedBody = JSON.parse(text);
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            const params = new URLSearchParams(text);
            parsedBody = Object.fromEntries(params.entries());
          } else {
            parsedBody = text;
          }
        }
      } catch {
        allErrors.push({
          field: 'body',
          message: 'Invalid request body format',
          code: 'INVALID_BODY_FORMAT',
        });
      }
    }

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());

    // Parse headers
    const headers = Object.fromEntries(request.headers.entries());

    // Validate against each rule
    for (const rule of rules) {
      if (rule.methods && !rule.methods.includes(method)) continue;

      // Validate body
      if (rule.body && parsedBody !== undefined) {
        const result = rule.body.safeParse(parsedBody);
        if (!result.success) {
          allErrors.push(...this.formatZodErrors(result.error, 'body'));
        } else {
          data.body = result.data;
        }
      }

      // Validate query
      if (rule.query) {
        const result = rule.query.safeParse(queryParams);
        if (!result.success) {
          allErrors.push(...this.formatZodErrors(result.error, 'query'));
        } else {
          data.query = result.data;
        }
      }

      // Validate headers
      if (rule.headers) {
        const result = rule.headers.safeParse(headers);
        if (!result.success) {
          allErrors.push(...this.formatZodErrors(result.error, 'headers'));
        } else {
          data.headers = result.data;
        }
      }

      // Validate params (path parameters)
      if (rule.params) {
        const pathParams = this.extractPathParams(pattern, pathname);
        const result = rule.params.safeParse(pathParams);
        if (!result.success) {
          allErrors.push(...this.formatZodErrors(result.error, 'params'));
        } else {
          data.params = result.data;
        }
      }

      // Custom validation
      if (rule.custom) {
        const customErrors = await rule.custom(request);
        allErrors.push(...customErrors);
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      data: Object.keys(data).length > 0 ? data : undefined,
    };
  }

  /**
   * Run basic request checks (size, content-type, headers)
   */
  private async runBasicChecks(request: Request): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    const method = request.method;
    const contentType = request.headers.get('content-type') || '';
    const contentLength = request.headers.get('content-length');

    // Check content-type for mutating requests
    if (this.config.requireContentType && ['POST', 'PUT', 'PATCH'].includes(method)) {
      if (!contentType) {
        errors.push({
          field: 'content-type',
          message: 'Content-Type header is required',
          code: 'MISSING_CONTENT_TYPE',
        });
      } else if (this.config.allowedContentTypes.length > 0) {
        const isAllowed = this.config.allowedContentTypes.some(allowed => 
          contentType.toLowerCase().startsWith(allowed.toLowerCase())
        );
        if (!isAllowed) {
          errors.push({
            field: 'content-type',
            message: `Content-Type not allowed. Allowed: ${this.config.allowedContentTypes.join(', ')}`,
            code: 'INVALID_CONTENT_TYPE',
            received: contentType,
          });
        }
      }
    }

    // Check request size
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > this.config.maxBodySize) {
        errors.push({
          field: 'content-length',
          message: `Request body too large. Maximum: ${this.config.maxBodySize} bytes`,
          code: 'BODY_TOO_LARGE',
          received: size,
        });
      }
    }

    // Check query string length
    const url = new URL(request.url);
    if (url.search.length > this.config.maxQueryLength) {
      errors.push({
        field: 'query',
        message: `Query string too long. Maximum: ${this.config.maxQueryLength} characters`,
        code: 'QUERY_TOO_LONG',
        received: url.search.length,
      });
    }

    // Check header count
    const headerCount = [...request.headers.entries()].length;
    if (headerCount > this.config.maxHeaderCount) {
      errors.push({
        field: 'headers',
        message: `Too many headers. Maximum: ${this.config.maxHeaderCount}`,
        code: 'TOO_MANY_HEADERS',
        received: headerCount,
      });
    }

    // Check header value lengths
    for (const [name, value] of request.headers.entries()) {
      if (value.length > this.config.maxHeaderValueLength) {
        errors.push({
          field: `header:${name}`,
          message: `Header value too long. Maximum: ${this.config.maxHeaderValueLength} characters`,
          code: 'HEADER_VALUE_TOO_LONG',
          received: value.length,
        });
      }
    }

    // Check for duplicate query parameters (if enabled)
    if (this.config.rejectDuplicateParams) {
      const params = new URLSearchParams(url.search);
      const seen = new Set<string>();
      for (const [key] of params.entries()) {
        if (seen.has(key)) {
          errors.push({
            field: `query:${key}`,
            message: `Duplicate query parameter: ${key}`,
            code: 'DUPLICATE_QUERY_PARAM',
          });
        }
        seen.add(key);
      }
    }

    return errors;
  }

  /**
   * Match route pattern against method and pathname
   */
  private matchRoute(pattern: string, method: string, pathname: string): boolean {
    const [patternMethod, patternPath] = pattern.split(' ', 2);
    if (patternMethod !== '*' && patternMethod !== method) return false;
    
    // Simple pattern matching with wildcards
    const regexPattern = patternPath
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/:([^/]+)/g, '([^/]+)');
    
    return new RegExp(`^${regexPattern}$`).test(pathname);
  }

  /**
   * Extract path parameters from pathname using pattern
   */
  private extractPathParams(pattern: string, pathname: string): Record<string, string> {
    const params: Record<string, string> = {};
    const [, patternPath] = pattern.split(' ', 2);
    
    const patternParts = patternPath.split('/');
    const pathParts = pathname.split('/');
    
    for (let i = 0; i < patternParts.length && i < pathParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];
      
      if (patternPart.startsWith(':') && patternPart.endsWith(')')) {
        // :paramName(regex)
        const match = patternPart.slice(1, -1).match(/^([^()]+)\((.+)\)$/);
        if (match) {
          params[match[1]] = pathPart;
        }
      } else if (patternPart.startsWith(':')) {
        // :paramName
        params[patternPart.slice(1)] = pathPart;
      }
    }
    
    return params;
  }

  /**
   * Format Zod errors into ValidationError array
   */
  private formatZodErrors(error: ZodError, prefix: string): ValidationError[] {
    return error.errors.map(err => ({
      field: `${prefix}.${err.path.join('.')}`,
      message: err.message,
      code: err.code.toUpperCase(),
      received: err.received,
    }));
  }

  /**
   * Create validated request wrapper
   */
  createValidatedRequest(request: Request, result: ValidationResult): ValidatedRequest {
    const validatedRequest = request as ValidatedRequest;
    validatedRequest.validated = result.data;
    return validatedRequest;
  }

  /**
   * Build standardized validation error response
   */
  buildErrorResponse(result: ValidationResult): Response {
    return new Response(
      JSON.stringify({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: result.errors,
        },
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  /**
   * Get all registered routes (for debugging)
   */
  getRegisteredRoutes(): string[] {
    return [...this.routeRules.keys()];
  }

  /**
   * Clear all rules
   */
  clear(): void {
    this.routeRules.clear();
    this.globalRules.length = 0;
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Create a validation rule from Zod schemas
 */
export function createValidationRule(options: {
  body?: ZodSchema;
  query?: ZodSchema;
  headers?: ZodSchema;
  params?: ZodSchema;
  methods?: string[];
}): ValidationRule {
  return options;
}

/**
 * Create body-only validation rule
 */
export function validateBody(schema: ZodSchema, methods?: string[]): ValidationRule {
  return { body: schema, methods };
}

/**
 * Create query-only validation rule
 */
export function validateQuery(schema: ZodSchema, methods?: string[]): ValidationRule {
  return { query: schema, methods };
}

/**
 * Create params-only validation rule
 */
export function validateParams(schema: ZodSchema, methods?: string[]): ValidationRule {
  return { params: schema, methods };
}

/**
 * Combine multiple validation rules
 */
export function combineRules(...rules: ValidationRule[]): ValidationRule {
  return {
    body: rules.find(r => r.body)?.body,
    query: rules.find(r => r.query)?.query,
    headers: rules.find(r => r.headers)?.headers,
    params: rules.find(r => r.params)?.params,
    methods: rules.find(r => r.methods)?.methods,
    custom: async (request) => {
      const allErrors: ValidationError[] = [];
      for (const rule of rules) {
        if (rule.custom) {
          allErrors.push(...await rule.custom(request));
        }
      }
      return allErrors;
    },
  };
}

// ─── Singleton Instance ────────────────────────────────────────────────────────

let validatorInstance: RequestValidator | null = null;

export function getRequestValidator(config?: Partial<ValidationConfig>): RequestValidator {
  if (!validatorInstance) {
    validatorInstance = new RequestValidator(config);
  }
  return validatorInstance;
}

export function resetRequestValidator(): void {
  validatorInstance = null;
}