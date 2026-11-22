export type ProtocolType = 'rest' | 'sse' | 'rpc';

export type FaultType = 'none' | 'timeout' | 'network_error' | 'http_500' | 'rate_limit' | 'partial_data';

export interface EndpointMatcher {
  protocol: ProtocolType;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  pathPattern: string;
  rpcMethod?: string;
  queryParams?: Record<string, string>;
}

export interface FaultInjectionConfig {
  type: FaultType;
  latencyMs: number;
  jitterMs: number;
  failureRate: number; // 0 to 1
  statusCode?: number;
}

export interface StreamEventStep {
  id: string;
  event: string;
  data: string;
  delayMs: number;
}

export interface MockRule {
  id: string;
  name: string;
  enabled: boolean;
  matcher: EndpointMatcher;
  statusCode: number;
  headers: Record<string, string>;
  responseBody: string;
  streamSteps?: StreamEventStep[];
  fault: FaultInjectionConfig;
  sequenceIndex?: number;
}

export interface MockScenario {
  id: string;
  name: string;
  version: string;
  profile: 'dev' | 'e2e' | 'demo' | 'bug-repro';
  description: string;
  rules: MockRule[];
  updatedAt: string;
}

export interface RedactionConfig {
  sensitiveKeys: string[];
  maskValue: string;
}

export interface RuntimeDiagnostics {
  unmatchedRequests: Array<{ timestamp: string; method: string; path: string }>;
  ruleConflicts: Array<{ ruleA: string; ruleB: string; reason: string }>;
  matchedCount: number;
}

const DEFAULT_REDACTION: RedactionConfig = {
  sensitiveKeys: ['authorization', 'token', 'secret', 'password', 'apiKey', 'cookie'],
  maskValue: '[REDACTED]',
};

/**
 * Guardrail preventing accidental mock runtime activation in production.
 */
export function isMockRuntimeAllowed(env: string | undefined = process.env.NODE_ENV): boolean {
  if (env === 'production' && process.env.NEXT_PUBLIC_ALLOW_MOCK_WORKBENCH !== 'true') {
    return false;
  }
  return true;
}

/**
 * Deterministic PRNG for reproducible latency jitter and fault injection.
 */
export function deterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/**
 * Redacts sensitive fields from captured payloads before saving as scenarios.
 */
export function redactPayload<T>(payload: T, config: RedactionConfig = DEFAULT_REDACTION): T {
  if (payload === null || typeof payload !== 'object') {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => redactPayload(item, config)) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const isSensitive = config.sensitiveKeys.some((sk) =>
      key.toLowerCase().includes(sk.toLowerCase()),
    );
    result[key] = isSensitive ? config.maskValue : redactPayload(value, config);
  }
  return result as T;
}

/**
 * Matches an incoming request against a scenario's enabled rules.
 */
export function matchMockRule(
  scenario: MockScenario,
  request: { protocol: ProtocolType; method?: string; path: string; rpcMethod?: string },
): MockRule | null {
  for (const rule of scenario.rules) {
    if (!rule.enabled) continue;
    if (rule.matcher.protocol !== request.protocol) continue;
    if (
      request.protocol === 'rest' &&
      rule.matcher.method &&
      rule.matcher.method !== request.method
    ) {
      continue;
    }
    if (
      request.protocol === 'rpc' &&
      rule.matcher.rpcMethod &&
      rule.matcher.rpcMethod !== request.rpcMethod
    ) {
      continue;
    }
    const regex = new RegExp(
      '^' + rule.matcher.pathPattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    );
    if (regex.test(request.path)) {
      return rule;
    }
  }
  return null;
}

/**
 * Detects overlapping rule matchers within a scenario for developer diagnostics.
 */
export function detectRuleConflicts(rules: MockRule[]): RuntimeDiagnostics['ruleConflicts'] {
  const conflicts: RuntimeDiagnostics['ruleConflicts'] = [];
  const enabled = rules.filter((r) => r.enabled);
  for (let i = 0; i < enabled.length; i++) {
    for (let j = i + 1; j < enabled.length; j++) {
      const a = enabled[i];
      const b = enabled[j];
      if (
        a.matcher.protocol === b.matcher.protocol &&
        a.matcher.pathPattern === b.matcher.pathPattern &&
        a.matcher.method === b.matcher.method &&
        a.matcher.rpcMethod === b.matcher.rpcMethod
      ) {
        conflicts.push({
          ruleA: a.name,
          ruleB: b.name,
          reason: `Duplicate matcher for ${a.matcher.protocol.toUpperCase()} ${a.matcher.pathPattern}`,
        });
      }
    }
  }
  return conflicts;
}
