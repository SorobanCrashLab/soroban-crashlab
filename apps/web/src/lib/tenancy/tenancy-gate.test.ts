/**
 * Repository gate (#1894): every public method of a scoped repository module
 * must take a `TenantScope` as its first parameter. Parsed with the TypeScript
 * compiler API rather than grepped, so formatting cannot fool it. Adding a
 * store to `SCOPED_MODULES` brings it under the gate.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../..');

const SCOPED_MODULES = ['lib/tenancy/scoped-repository.ts', 'lib/artifact-store.ts'];

/** Exports that are not data accessors (constructors, backends, types' helpers). */
const NON_ACCESSORS = new Set(['createMapBackend']);

function firstParamType(node: ts.SignatureDeclarationBase, source: ts.SourceFile): string | undefined {
  return node.parameters[0]?.type?.getText(source);
}

function unscopedMembers(relativePath: string, root = SRC): string[] {
  const file = path.join(root, relativePath);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const offenders: string[] = [];

  const isExported = (node: ts.Node) =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  source.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && isExported(node) && node.name && !NON_ACCESSORS.has(node.name.text)) {
      if (firstParamType(node, source) !== 'TenantScope') offenders.push(`${relativePath}:${node.name.text}`);
    }
    if (ts.isVariableStatement(node) && isExported(node)) {
      for (const declaration of node.declarationList.declarations) {
        offenders.push(`${relativePath}:${declaration.name.getText(source)} (exported binding)`);
      }
    }
    if (ts.isClassDeclaration(node) && isExported(node)) {
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const modifiers = ts.getModifiers(member) ?? [];
        if (modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) continue;
        if (firstParamType(member, source) !== 'TenantScope') {
          offenders.push(`${relativePath}:${node.name?.text}.${member.name.getText(source)}`);
        }
      }
    }
  });
  return offenders;
}

describe('no unscoped repository method', () => {
  it.each(SCOPED_MODULES)('%s', (modulePath) => {
    expect(unscopedMembers(modulePath)).toEqual([]);
  });

  it('the gate catches an unscoped accessor', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenancy-gate-'));
    fs.writeFileSync(
      path.join(dir, 'probe.ts'),
      'export function listEverything(limit: number) { return limit; }\nexport const rawStore = new Map();\n',
    );
    try {
      expect(unscopedMembers('probe.ts', dir)).toEqual(['probe.ts:listEverything', 'probe.ts:rawStore (exported binding)']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
