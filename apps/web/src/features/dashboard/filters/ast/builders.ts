/**
 * Fluent builder API for constructing filter ASTs (#2194).
 *
 * Usage:
 *   const ast = filter()
 *     .where('status', 'eq', 'crashed')
 *     .or()
 *     .group(g => g.where('area', 'in', ['auth']).where('severity', 'eq', 'critical'))
 *     .build();
 */

import {
  type FilterAST,
  type FilterGroup,
  type FilterNode,
  type FilterOperator,
  type FilterCondition,
  createCondition,
  createGroup,
  generateNodeId,
  isGroup,
  isCondition,
} from './FilterAST';

/** Immutable helper: add a condition to a group's children. */
export function addCondition(
  ast: FilterGroup,
  condition: { field: string; operator: FilterOperator; value: string | number | boolean | string[] },
): FilterGroup {
  const node = createCondition(condition.field, condition.operator, condition.value);
  return { ...ast, children: [...ast.children, node] };
}

/** Immutable helper: add a nested group. */
export function addGroup(
  ast: FilterGroup,
  groupType: 'and' | 'or' = 'and',
  children: FilterNode[] = [],
): FilterGroup {
  const group = createGroup(groupType, children);
  return { ...ast, children: [...ast.children, group] };
}

/** Immutable helper: remove a node by id (searches recursively). */
export function removeNode(group: FilterGroup, nodeId: string): FilterGroup {
  return {
    ...group,
    children: group.children
      .filter((child) => child.id !== nodeId)
      .map((child) => (isGroup(child) ? removeNode(child, nodeId) : child)),
  };
}

/** Immutable helper: update a condition by id. */
export function updateCondition(
  group: FilterGroup,
  conditionId: string,
  updates: Partial<Pick<FilterCondition, 'field' | 'operator' | 'value'>>,
): FilterGroup {
  return {
    ...group,
    children: group.children.map((child) => {
      if (isCondition(child) && child.id === conditionId) {
        return { ...child, ...updates };
      }
      if (isGroup(child)) {
        return updateCondition(child, conditionId, updates);
      }
      return child;
    }),
  };
}

/** Immutable helper: update a group's type by id. */
export function updateGroupType(
  group: FilterGroup,
  groupId: string,
  groupType: 'and' | 'or',
): FilterGroup {
  if (group.id === groupId) {
    return { ...group, groupType };
  }
  return {
    ...group,
    children: group.children.map((child) =>
      isGroup(child) ? updateGroupType(child, groupId, groupType) : child,
    ),
  };
}

/** Immutable helper: duplicate a node (deep clone with new ids). */
export function duplicateNode(group: FilterGroup, nodeId: string): FilterGroup {
  function cloneNode(node: FilterNode): FilterNode {
    if (isCondition(node)) {
      return { ...node, id: generateNodeId() };
    }
    return {
      ...node,
      id: generateNodeId(),
      children: node.children.map(cloneNode),
    };
  }

  const newChildren: FilterNode[] = [];
  for (const child of group.children) {
    newChildren.push(child);
    if (child.id === nodeId) {
      newChildren.push(cloneNode(child));
    } else if (isGroup(child)) {
      // Recursively duplicate inside nested groups.
      const updated = duplicateNode(child, nodeId);
      if (updated !== child) {
        newChildren[newChildren.length - 1] = updated;
      }
    }
  }
  return { ...group, children: newChildren };
}

// ── Fluent builder ────────────────────────────────────────────────────────────

interface FluentBuilder {
  where(field: string, operator: FilterOperator, value: string | number | boolean | string[]): FluentBuilder;
  and(): FluentBuilder;
  or(): FluentBuilder;
  group(fn: (b: FluentBuilder) => void): FluentBuilder;
  build(): FilterAST;
}

/**
 * Create a fluent builder starting with an empty AND group.
 */
export function filter(): FluentBuilder {
  const root: FilterGroup = createGroup('and');
  let currentGroup: FilterGroup = root;
  const _groupStack: FilterGroup[] = [];

  function createBuilder(): FluentBuilder {
    return {
      where(field, operator, value) {
        currentGroup = addCondition(currentGroup, { field, operator, value });
        return createBuilder();
      },
      and() {
        currentGroup = { ...currentGroup, groupType: 'and' };
        return createBuilder();
      },
      or() {
        currentGroup = { ...currentGroup, groupType: 'or' };
        return createBuilder();
      },
      group(fn) {
        const childGroup = createGroup('and');
        const previousGroup = currentGroup;
        currentGroup = childGroup;
        fn(createBuilder());
        previousGroup.children = [...previousGroup.children, currentGroup];
        currentGroup = previousGroup;
        return createBuilder();
      },
      build() {
        return root;
      },
    };
  }

  return createBuilder();
}
