/**
 * ABAC attribute model for principals, resources, and context.
 *
 * This module defines the attribute types used by the policy engine.
 * Attributes are the building blocks of ABAC policies - they describe
 * who (principal) is trying to do what (action) to what (resource)
 * under what conditions (context).
 */

// ─── Principal Attributes ──────────────────────────────────────────────────────

/**
 * Unique identifier for the principal.
 * Examples: "github:alice", "api-key:token-123", "oidc:bob", "anonymous"
 */
export type PrincipalId = string;

/**
 * Identity providers supported by the system.
 */
export type IdentityType = 'github' | 'api-key' | 'oidc' | 'anonymous';

/**
 * User identity with type and value.
 */
export interface UserIdentity {
  type: IdentityType;
  value: string;
}

/**
 * Team a principal belongs to (for campaign-level permissions).
 */
export type TeamId = string;

/**
 * Principal attributes - the "who" in "permit who, action, resource".
 */
export interface PrincipalAttributes {
  /** Unique principal identifier */
  id: PrincipalId;
  /** Identity type (github, api-key, oidc, anonymous) */
  identityType: IdentityType;
  /** The actual identity value (username, token ID, etc.) */
  identityValue: string;
  /** User's role (derived from role store) */
  role: UserRole;
  /** Teams the user belongs to */
  teams: TeamId[];
  /** Groups the user is a member of (for broader permissions) */
  groups: string[];
  /** User's risk score (calculated from behavior, can influence policies) */
  riskScore?: number;
  /** When the principal's attributes were last refreshed */
  updatedAt?: number;
}

// ─── Resource Attributes ─────────────────────────────────────────────────────

/**
 * Resource types supported by the system.
 */
export type ResourceType = 'campaign' | 'run' | 'artifact' | 'network' | 'schedule' | 'token';

/**
 * Campaign-specific attributes.
 */
export interface CampaignAttributes {
  /** Campaign ID */
  id: string;
  /** Team that owns the campaign */
  team: TeamId;
  /** Campaign name */
  name?: string;
  /** Campaign status (active, paused, completed) */
  status?: CampaignStatus;
  /** Tags associated with the campaign */
  tags?: string[];
  /** Owner of the campaign */
  owner?: PrincipalId;
  /** Campaign visibility (public, private, internal) */
  visibility?: 'public' | 'private' | 'internal';
  /** When the campaign was created */
  createdAt?: number;
  /** When the campaign expires (if time-bound) */
  expiresAt?: number;
  /** Environment/network the campaign runs on */
  environment?: string;
}

/**
 * Run-specific attributes.
 */
export interface RunAttributes {
  /** Run ID */
  id: string;
  /** Campaign this run belongs to */
  campaignId: string;
  /** Team associated with the run (via campaign) */
  team: TeamId;
  /** Run status (queued, running, completed, failed) */
  status?: RunStatus;
  /** Run type (fuzz, replay, validation) */
  type?: RunType;
  /** Tags associated with the run */
  tags?: string[];
  /** When the run started */
  startedAt?: number;
  /** When the run completed or failed */
  completedAt?: number;
}

/**
 * Artifact-specific attributes.
 */
export interface ArtifactAttributes {
  /** Artifact ID */
  id: string;
  /** Run this artifact belongs to */
  runId: string;
  /** Campaign this artifact belongs to (via run) */
  campaignId: string;
  /** Team associated with the artifact (via run/campaign) */
  team: TeamId;
  /** Artifact type (coverage, corpus, replay, crash) */
  type?: ArtifactType;
  /** Artifact sensitivity level */
  sensitivity?: SensitivityLevel;
  /** When the artifact was uploaded */
  uploadedAt?: number;
}

/**
 * Network endpoints and infrastructure.
 */
export interface NetworkAttributes {
  /** Network ID */
  id: string;
  /** Network type (rpc, horizon, custom) */
  type?: NetworkType;
  /** Network description (e.g., "Stellar Mainnet") */
  description?: string;
  /** Whether this is the active network */
  isActive?: boolean;
  /** Allowed IPs for access */
  allowedIps?: string[]; // CIDR notation
}

/**
 * Token attributes for API tokens.
 */
export interface TokenAttributes {
  /** Token ID */
  id: string;
  /** Token name/label */
  name?: string;
  /** Scopes the token has access to */
  scopes?: string[];
  /** Token owner (principal ID) */
  owner?: PrincipalId;
  /** When the token was created */
  createdAt?: number;
  /** When the token expires (if time-bound) */
  expiresAt?: number;
}

/**
 * Union type for all resource attributes.
 */
export type ResourceAttributes =
  | CampaignAttributes
  | RunAttributes
  | ArtifactAttributes
  | NetworkAttributes
  | TokenAttributes;

/**
 * Generic resource wrapper for policy evaluation.
 */
export interface Resource {
  /** Type of resource */
  type: ResourceType;
  /** Resource-specific attributes */
  attributes: ResourceAttributes;
}

// ─── Context Attributes ──────────────────────────────────────────────────────

/**
 * Context attributes for dynamic policy evaluation.
 * These describe the environment and conditions of the request.
 */
export interface ContextAttributes {
  /** Request timestamp */
  time: number;
  /** Client IP address */
  ip?: string;
  /** User agent string */
  userAgent?: string;
  /** Request ID for tracing */
  requestId?: string;
  /** Whether MFA was verified */
  mfaVerified?: boolean;
  /** Geographic location (derived from IP) */
  location?: string;
  /** Device type (desktop, mobile, api) */
  device?: DeviceType;
  /** Whether this is a test/dry-run */
  isDryRun?: boolean;
  /** Current timezone */
  timezone?: string;
}

// ─── Supporting Types ──────────────────────────────────────────────────────

/** User role (higher role satisfies lower role requirements) */
export type UserRole = 'analyst' | 'maintainer' | 'admin';

/** Role hierarchy: higher role satisfies lower role requirements */
export function roleHierarchy(role: UserRole): number {
  switch (role) {
    case 'admin': return 3;
    case 'maintainer': return 2;
    case 'analyst': return 1;
    default:
      const _exhaustiveCheck: never = role;
      return 0;
  }
}

/** Campaign status */
export type CampaignStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'archived';

/** Run status */
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Run type */
export type RunType = 'fuzz' | 'replay' | 'validation';

/** Artifact type */
export type ArtifactType = 'corpus' | 'crash' | 'coverage' | 'replay';

/** Sensitivity level for artifacts */
export type SensitivityLevel = 'public' | 'internal' | 'confidential' | 'restricted';

/** Network type */
export type NetworkType = 'rpc' | 'horizon' | 'custom';

/** Device type */
export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'api' | 'cli';

/**
 * Action type - what the principal wants to do.
 * These are the operations that can be permitted/denied.
 */
export type Action =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'annotate'
  | 'triage'
  | 'replay'
  | 'manage'
  | 'download'
  | 'admin';

/**
 * Time window for policies.
 */
export interface TimeWindow {
  /** Start time (HH:MM format) */
  start?: string;
  /** End time (HH:MM format) */
  end?: string;
  /** Days of week (0 = Sunday) */
  days?: number[]; // 0=Sunday, 1=Monday, etc.
  /** Timezone for the window */
  timezone?: string;
}