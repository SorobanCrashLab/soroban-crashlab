import { selectRecordDriver, type RecordDriver } from '@/lib/storage/record-driver';
import {
  MAX_WORKFLOW_RULES,
  type SimulationResult,
  type WorkflowRule,
  workflowRuleSchema,
} from './rules';

const RULES_INDEX_PREFIX = 'automation:rules:';
const RULE_RECORD_PREFIX = 'automation:rule:';
const EXECUTIONS_KEY_PREFIX = 'automation:executions:';
export const MAX_AUTOMATION_EXECUTIONS = 500;

function scopeKey(scope: string): string {
  return encodeURIComponent(scope);
}

function rulesIndex(scope: string): string {
  return `${RULES_INDEX_PREFIX}${scopeKey(scope)}`;
}

function ruleKey(scope: string, id: string): string {
  return `${RULE_RECORD_PREFIX}${scopeKey(scope)}:${id}`;
}

function executionsKey(scope: string): string {
  return `${EXECUTIONS_KEY_PREFIX}${scopeKey(scope)}`;
}

function parseRule(raw: string): WorkflowRule {
  const parsed: unknown = JSON.parse(raw);
  const shape = workflowRuleSchema.safeParse(parsed);
  if (!shape.success) {
    throw new Error('Stored workflow rule is invalid.');
  }
  return shape.data;
}

export class AutomationStore {
  constructor(private readonly driver?: RecordDriver) {}

  private getDriver(): RecordDriver {
    return this.driver ?? selectRecordDriver();
  }

  async listRules(scope: string): Promise<WorkflowRule[]> {
    const driver = this.getDriver();
    const ids = await driver.listIndex(rulesIndex(scope));
    const rules: WorkflowRule[] = [];
    for (const id of ids.slice(0, MAX_WORKFLOW_RULES)) {
      const raw = await driver.getRecord(ruleKey(scope, id));
      if (raw) rules.push(parseRule(raw));
    }
    return rules.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getRule(scope: string, id: string): Promise<WorkflowRule | null> {
    const raw = await this.getDriver().getRecord(ruleKey(scope, id));
    return raw ? parseRule(raw) : null;
  }

  async saveRule(scope: string, rule: WorkflowRule, isNew: boolean): Promise<void> {
    const driver = this.getDriver();
    if (isNew && (await driver.listIndex(rulesIndex(scope))).length >= MAX_WORKFLOW_RULES) {
      throw new Error(`A maximum of ${MAX_WORKFLOW_RULES} workflow rules is allowed.`);
    }
    await driver.putRecord(ruleKey(scope, rule.id), JSON.stringify(rule));
    if (isNew) await driver.addToIndex(rulesIndex(scope), rule.id);
  }

  async deleteRule(scope: string, id: string): Promise<boolean> {
    const driver = this.getDriver();
    const removed = await driver.deleteRecord(ruleKey(scope, id));
    if (removed) await driver.removeFromIndex(rulesIndex(scope), id);
    return removed;
  }

  async appendExecution(scope: string, result: SimulationResult, actor: string): Promise<void> {
    await this.getDriver().appendEntry(
      executionsKey(scope),
      JSON.stringify({ ...result, actor, createdAt: new Date().toISOString() }),
      MAX_AUTOMATION_EXECUTIONS,
    );
  }

  async listExecutions(
    scope: string,
    limit = 100,
  ): Promise<Array<SimulationResult & { actor: string; createdAt: string }>> {
    const entries = await this.getDriver().listEntries(
      executionsKey(scope),
      Math.max(1, Math.min(limit, MAX_AUTOMATION_EXECUTIONS)),
    );
    return entries.map((entry) => {
      const parsed: unknown = JSON.parse(entry);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('ruleId' in parsed) ||
        !('actor' in parsed) ||
        !('createdAt' in parsed)
      ) {
        throw new Error('Stored workflow execution is invalid.');
      }
      return parsed as SimulationResult & { actor: string; createdAt: string };
    });
  }
}

export const automationStore = new AutomationStore();
