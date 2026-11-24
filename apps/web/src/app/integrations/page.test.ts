import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const appRoot = path.resolve(__dirname);
const pagePath = path.resolve(appRoot, 'page.tsx');
const catalogPath = path.resolve(
  process.cwd(),
  'src/features/integrations/marketplace/catalog.ts',
);
const componentPath = path.resolve(
  process.cwd(),
  'src/features/integrations/marketplace/IntegrationCatalog.tsx',
);

const runAssertions = (): void => {
  for (const candidatePath of [pagePath, catalogPath, componentPath]) {
    if (!fs.existsSync(candidatePath)) {
      throw new Error(`Integration marketplace file not found: ${candidatePath}`);
    }
  }

  const page = fs.readFileSync(pagePath, 'utf-8');
  const catalog = fs.readFileSync(catalogPath, 'utf-8');
  const component = fs.readFileSync(componentPath, 'utf-8');

  assert.ok(
    page.includes('IntegrationCatalog'),
    'Integrations page should render the marketplace catalog',
  );
  assert.ok(
    catalog.includes('export const INTEGRATION_CATALOG'),
    'Marketplace should define a shared integration catalog',
  );
  assert.ok(
    component.includes('Search integrations'),
    'Marketplace should provide an integration search field',
  );
  assert.ok(
    component.includes('Filter integrations by category'),
    'Marketplace should provide category filters',
  );
  assert.ok(
    component.includes('Setup available'),
    'Marketplace should not claim unverified integrations are active',
  );
  assert.ok(
    component.includes('Prerequisites'),
    'Marketplace should display integration prerequisites',
  );
  assert.ok(
    component.includes('Documentation'),
    'Marketplace should link to integration documentation',
  );

  console.log('integrations/page.test.ts: all assertions passed');
};

runAssertions();
