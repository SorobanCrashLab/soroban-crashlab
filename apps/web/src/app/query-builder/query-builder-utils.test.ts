import {
  createCondition,
  createGroup,
  addCondition,
  generateQueryString,
  AVAILABLE_FIELDS,
} from './query-builder-utils';

const group = createGroup('test-group');
console.assert(group.id === 'test-group', 'Group should have correct id');
console.assert(group.logic === 'AND', 'Default logic should be AND');
console.assert(group.conditions.length === 0, 'Group should start with no conditions');

const condition = createCondition('cond-1', 'status');
console.assert(condition.id === 'cond-1', 'Condition should have correct id');
console.assert(condition.field === 'status', 'Condition should have correct field');
console.assert(condition.operator === 'equals', 'Default operator should be equals');

const groupWithCondition = addCondition(group, condition);
console.assert(groupWithCondition.conditions.length === 1, 'Should have 1 condition');
console.assert(AVAILABLE_FIELDS.length > 0, 'Should have available fields');

const queryStr = generateQueryString(groupWithCondition);
console.assert(queryStr.includes('status'), 'Query should contain field name');

console.log('✓ Query builder utilities tests passed');
