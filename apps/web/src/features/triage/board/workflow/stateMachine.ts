// WIP scaffold for issue #2282 (Triage Workflow Board). Not wired into any route yet.

export type TriageState =
  | "new"
  | "investigating"
  | "reproduced"
  | "fixing"
  | "verified"
  | "closed";

export const TRIAGE_STATES: readonly TriageState[] = [
  "new",
  "investigating",
  "reproduced",
  "fixing",
  "verified",
  "closed",
];

export const ALLOWED_TRANSITIONS: Record<TriageState, readonly TriageState[]> = {
  new: ["investigating", "closed"],
  investigating: ["reproduced", "closed"],
  reproduced: ["fixing", "closed"],
  fixing: ["verified", "closed"],
  verified: ["closed"],
  closed: [],
};

export function canTransition(from: TriageState, to: TriageState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
