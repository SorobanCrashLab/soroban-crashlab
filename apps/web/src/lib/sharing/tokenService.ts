// WIP scaffold for issue #2274 (Public Share Links & Embeddable Dashboards).
// Tokens here are NOT hashed-at-rest and there is no persistence layer yet — do not use
// this for real share links until that's implemented.
import { randomBytes } from "node:crypto";

export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface ShareTokenRecord {
  token: string;
  entityType: "run" | "campaign" | "dashboard" | "chart" | "report";
  entityId: string;
  expiresAt: string | null;
  revoked: boolean;
}
