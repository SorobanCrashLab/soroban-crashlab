// Main ABAC Policy for Soroban CrashLab
// Version: 1.0.0
// Description: Root policy for access control

// ─── Admin Role - Full Access ────────────────────────────────────────────────

// Admins can do anything
permit (principal, action, resource) when {
  principal.role == "admin"
};

// ─── Maintainer Role - Operational Access ───────────────────────────────────────

// Maintainers can create and manage campaigns
permit (principal, action, resource) when {
  principal.role == "maintainer"
  && resource.type == "campaign"
  && action in [create, update, delete, view]
};

// Maintainers can create and replays runs
permit (principal, action, resource) when {
  principal.role == "maintainer"
  && resource.type == "run"
  && action in [create, replay, view]
};

// Maintainers can manage networks
permit (principal, action, resource) when {
  principal.role == "maintainer"
  && resource.type == "network"
  && action in [create, update, delete, view, manage]
};

// ─── Analyst Role - Read and Triage Access ───────────────────────────────────

// Analysts can view runs and campaigns in their team
permit (principal, action, resource) when {
  principal.role == "analyst"
  && resource.type in ["run", "campaign"]
  && resource.team in principal.teams
  && action in [view, annotate, triage]
};

// Analysts can annotate runs
permit (principal, action, resource) when {
  principal.role == "analyst"
  && resource.type == "run"
  && action in ["annotate", "triage"]
  && resource.team in principal.teams
};

// ─── Team-Based Resource Ownership ───────────────────────────────────────────

// Team members can manage their own campaigns
permit (principal, action, resource) when {
  resource.type == "campaign"
  && resource.team == principal.teams[0]  // Primary team
  && action in [view, update, delete]
};

// Team members can view runs in their campaigns
permit (principal, action, resource) when {
  resource.type == "run"
  && resource.team == principal.teams[0]
  && action in [view, triage, annotate]
};

// ─── Time-Based Access ────────────────────────────────────────────────────────

// Business hours access for analysts
permit (principal, action, resource) when {
  principal.role == "analyst"
  && action == "view"
  && context.time >= "09:00:00"  // Business hours start
  && context.time <= "18:00:00"  // Business hours end
};

// 24/7 access for team leads (maintainers)
permit (principal, action, resource) when {
  principal.role == "maintainer"
  && principal.teams contains "lead"
};

// ─── IP-Based Access ────────────────────────────────────────────────────────

// IP allowlist for sensitive operations
permit (principal, action, resource) when {
  action in [create, delete]
  && context.ip != null
  && context.ip in "10.0.0.0/8"  // Internal network only
};

// ─── Artifact Access Based on Sensitivity ────────────────────────────────────

// Public artifacts can be viewed by anyone authenticated
permit (principal, action, resource) when {
  resource.type == "artifact"
  && resource.sensitivity == "public"
  && action == "view"
  && principal.authenticated == true
};

// Internal artifacts require team membership
permit (principal, action, resource) when {
  resource.type == "artifact"
  && resource.sensitivity == "internal"
  && resource.team in principal.teams
  && action in [view, download]
};

// Confidential artifacts restricted to maintainers and admins
permit (principal, action, resource) when {
  resource.type == "artifact"
  && resource.sensitivity == "confidential"
  && principal.role in ["maintainer", "admin"]
  && action in [view, download]
};

// Restricted artifacts admin-only
permit (principal, action, resource) when {
  resource.type == "artifact"
  && resource.sensitivity == "restricted"
  && principal.role == "admin"
};

// ─── API Token Scoping ───────────────────────────────────────────────────────

// Token scope-based access for automated systems
permit (principal, action, resource) when {
  principal.identityType == "api-key"
  && "runs:write" in principal.scopes
  && resource.type == "run"
  && action in [create]
};

permit (principal, action, resource) when {
  principal.identityType == "api-key"
  && "runs:read" in principal.scopes
  && resource.type == "run"
  && action == "view"
};

permit (principal, action, resource) when {
  principal.identityType == "api-key"
  && "settings:write" in principal.scopes
  && resource.type in ["network", "settings"]
  && action in [update]
};

// ─── Break-Glass Override ────────────────────────────────────────────────────

// Emergency access for approved break-glass requests
permit (principal, action, resource) when {
  context.isBreakGlass == true
  && action in [create, update, delete]
};

// ─── Debug Mode ───────────────────────────────────────────────────────────────

// Allow debug access in development environments
permit (principal, action, resource) when {
  context.environment == "development"
  && principal.role in ["analyst", "maintainer", "admin"]
};