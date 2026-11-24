# Workflow automation builder

The automation UI lets users create and version trigger/condition/action rules,
manage draft/enabled/paused metadata, run sample-event simulations, and inspect
simulation history. Rules and execution entries are stored through the shared
record driver, scoped to the resolved principal. Mutating rule endpoints require
the maintainer role; simulation is read-only with respect to external systems.

## Safety and current boundaries

- Triggers and condition fields/operators are allowlisted and validated.
- A rule may contain at most 10 conditions and 5 planned actions; the scope can
  store at most 100 rules and retains the latest 20 versions per rule.
- Simulations use named sample events and only return a match result and planned
  actions. They do not dispatch notifications, create tickets, replay runs, or
  pause campaigns.
- “Enabled” is lifecycle metadata only in this iteration. Production event
  ingestion and action dispatch are not connected, so the UI states this
  explicitly rather than implying that enabled rules are running.
- Rule versions and simulation entries retain their actor and timestamp for
  review. The backing record driver is in-memory unless Redis is configured;
  production deployments that need cross-instance durability must configure the
  existing shared record store.

When adding a trigger or action, update the allowlisted model, sample-event
coverage, API catalog registration, and focused tests. Do not evaluate user
supplied code or expressions.
