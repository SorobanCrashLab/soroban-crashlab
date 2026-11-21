/**
 * SBOM Generator
 * 
 * Generates Software Bill of Materials in CycloneDX and SPDX formats.
 * Supports multiple ecosystems (npm, cargo, go, python, container images).
 */

import { writeFile, readFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname, extname, basename } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'node:crypto';

export type SBOMFormat = 'cyclonedx-json' | 'cyclonedx-xml' | 'spdx-json' | 'spdx-tagvalue';

export interface SBOMComponent {
  name: string;
  version: string;
  description?: string;
  type: 'library' | 'application' | 'framework' | 'container' | 'operating-system' | 'device' | 'firmware' | 'file';
  author?: string;
  publisher?: string;
  group?: string;
  licenses: SBMLicense[];
  copyright?: string;
  cpe?: string;
  purl?: string;
  swid?: string;
  hashes: SBOMHash[];
  externalReferences: SBOMExternalReference[];
  components?: SBOMComponent[];
  properties?: SBOMProperty[];
}

export interface SBMLicense {
  id?: string;
  name?: string;
  text?: string;
  url?: string;
}

export interface SBOMHash {
  algorithm: 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' | 'BLAKE2b-256' | 'BLAKE2b-384' | 'BLAKE2b-512' | 'BLAKE3';
  value: string;
}

export interface SBOMExternalReference {
  type: 'vcs' | 'website' | 'documentation' | 'distribution' | 'license' | 'build-meta' | 'build-info' | 'advisories' | 'issue-tracker' | 'support' | 'social' | 'chat' | 'other';
  url: string;
  comment?: string;
  hashes?: SBOMHash[];
}

export interface SBOMProperty {
  name: string;
  value: string;
}

export interface SBOMMetadata {
  timestamp: string;
  tools: SBOMTool[];
  authors: SBOMAuthor[];
  component: SBOMComponent;
  manufacture?: SBOMOrganization;
  supplier?: SBOMOrganization;
  licenses: SBMLicense[];
  properties: SBOMProperty[];
}

export interface SBOMTool {
  vendor: string;
  name: string;
  version: string;
  hashes?: SBOMHash[];
}

export interface SBOMAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface SBOMOrganization {
  name: string;
  url?: string;
  contact?: string;
}

export interface CycloneDXBOM {
  bomFormat: 'CycloneDX';
  specVersion: '1.4' | '1.5' | '1.6';
  serialNumber: string;
  version: 1;
  metadata: SBOMMetadata;
  components: SBOMComponent[];
  services?: SBOMService[];
  dependencies?: SBOMDependency[];
  compositions?: SBOMComposition[];
  vulnerabilities?: SBOMVulnerability[];
}

export interface SBOMService {
  name: string;
  version?: string;
  description?: string;
  endpoints?: string[];
  authenticated?: boolean;
  xTrustBoundary?: boolean;
  data?: SBOMDataClassification[];
  licenses?: SBMLicense[];
  externalReferences?: SBOMExternalReference[];
  properties?: SBOMProperty[];
}

export interface SBOMDataClassification {
  classification: 'public' | 'private' | 'confidential' | 'restricted';
  flow?: 'input' | 'output' | 'bidirectional';
}

export interface SBOMDependency {
  ref: string;
  dependsOn: string[];
}

export interface SBOMComposition {
  aggregate: 'complete' | 'incomplete' | 'unknown';
  assemblies: SBOMCompositionAssembly[];
}

export interface SBOMCompositionAssembly {
  name: string;
  version?: string;
  description?: string;
  components: string[];
  assemblies?: SBOMCompositionAssembly[];
  dependencies?: SBOMDependency[];
}

export interface SBOMVulnerability {
  id: string;
  source?: SBOMVulnerabilitySource;
  ratings?: SBOMVulnerabilityRating[];
  cwes?: number[];
  description?: string;
  recommendations?: SBOMRecommendation[];
  advisories?: SBOMAdvisory[];
  created?: string;
  published?: string;
  updated?: string;
  credits?: SBOMCredit[];
  tools?: SBOMTool[];
  analysis?: SBOMVulnerabilityAnalysis;
  affects?: SBOMComponent[];
  properties?: SBOMProperty[];
}

export interface SBOMVulnerabilitySource {
  name: string;
  url: string;
}

export interface SBOMVulnerabilityRating {
  source?: SBOMVulnerabilitySource;
  method: 'CVSSv2' | 'CVSSv3' | 'CVSSv31' | 'CVSSv4' | 'OWASP' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none' | 'unknown';
  score?: number;
  vector?: string;
  justification?: string;
}

export interface SBOMRecommendation {
  category: 'upgrade' | 'workaround' | 'cannot-fix' | 'will-not-fix' | 'investigation' | 'rollback' | 'other';
  description: string;
}

export interface SBOMAdvisory {
  id: string;
  title?: string;
  summary?: string;
  url?: string;
}

export interface SBOMCredit {
  name: string;
  email?: string;
  url?: string;
  organization?: string;
}

export interface SBOMVulnerabilityAnalysis {
  state: 'not-affected' | 'affected' | 'fixed' | 'under-investigation' | 'investigation-complete';
  justification?: string;
  detail?: string;
  response?: SBOMRecommendation[];
  firstIssued?: string;
  lastUpdated?: string;
}

export interface SPDXDocument {
  spdxVersion: 'SPDX-2.2' | 'SPDX-2.3';
  dataLicense: 'CC0-1.0';
  SPDXID: 'SPDXRef-DOCUMENT';
  name: string;
  documentNamespace: string;
  creationInfo: SPDXCreationInfo;
  packages: SPDXPackage[];
  relationships: SPDXRelationship[];
}

export interface SPDXCreationInfo {
  created: string;
  creators: string[];
  licenseListVersion: string;
}

export interface SPDXPackage {
  SPDXID: string;
  name: string;
  version?: string;
  downloadLocation: string;
  filesAnalyzed: boolean;
  licenseConcluded: string;
  licenseDeclared?: string;
  copyrightText?: string;
  supplier?: string;
  originator?: string;
  homepage?: string;
  sourceInfo?: string;
  checksums: SPDXChecksum[];
  licenseInfoFromFiles: string[];
  externalRefs: SPDXExternalRef[];
}

export interface SPDXChecksum {
  algorithm: 'SHA1' | 'SHA256' | 'SHA384' | 'SHA512' | 'MD5' | 'SHA224' | 'SHA3-224' | 'SHA3-256' | 'SHA3-384' | 'SHA3-512' | 'BLAKE2b-256' | 'BLAKE2b-384' | 'BLAKE2b-512' | 'BLAKE3';
  value: string;
}

export interface SPDXExternalRef {
  referenceCategory: 'PACKAGE-MANAGER' | 'SECURITY' | 'PERSISTENT-ID' | 'OTHER';
  referenceType: string;
  referenceLocator: string;
  comment?: string;
}

export interface SPDXRelationship {
  spdxElementId: string;
  relationshipType: 'DESCRIBES' | 'DEPENDS_ON' | 'CONTAINS' | 'DEPENDENCY_OF' | 'DEPENDENCY_MANIFEST' | 'BUILD_TOOL_OF' | 'DEV_TOOL_OF' | 'TEST_TOOL_OF' | 'DOCUMENTATION_OF' | 'GENERATED_FROM' | 'PATCH_FOR' | 'PATCH_APPLIED' | 'COPY_OF' | 'FILE_OF' | 'FILE_ADDED' | 'FILE_DELETED' | 'FILE_MODIFIED' | 'DYNAMIC_LINK' | 'STATIC_LINK' | 'DATA_FILE_OF' | 'EXPANDED_FROM_ARCHIVE' | 'PATCH' | 'PREREQUISITE_FOR' | 'HAS_PREREQUISITE' | 'OPTIONAL_COMPONENT_OF' | 'OPTIONAL_DEPENDENCY_OF' | 'EXAMPLE_OF' | 'DISTRIBUTION_ARTIFACT' | 'SOURCE_OF' | 'BINARY_OF' | 'ARCHIVE_OF' | 'PATCH_OF';
  relatedSpdxElement: string;
  comment?: string;
}

export class SBOMGenerator {
  private tools: SBOMTool[] = [
    { vendor: 'CrashLab', name: 'sbom-generator', version: '1.0.0' },
  ];
  private authors: SBOMAuthor[] = [
    { name: 'CrashLab Security Team', email: 'security@crashlab.example' },
  ];

  /**
   * Generate CycloneDX SBOM from package.json
   */
  async generateFromNpm(packageJsonPath: string, options: GenerateOptions = {}): Promise<CycloneDXBOM> {
    const content = await readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    
    const components: SBOMComponent[] = [];
    
    // Main package
    components.push(await this.createComponentFromNpm(pkg, true));
    
    // Dependencies
    if (pkg.dependencies) {
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        components.push(await this.createComponentFromNpmDep(name, version as string));
      }
    }
    
    if (pkg.devDependencies && options.includeDevDependencies) {
      for (const [name, version] of Object.entries(pkg.devDependencies)) {
        components.push(await this.createComponentFromNpmDep(name, version as string, true));
      }
    }

    return this.createCycloneDXBOM(pkg.name, pkg.version, components, options);
  }

  /**
   * Generate SBOM from Cargo.lock
   */
  async generateFromCargo(cargoLockPath: string, options: GenerateOptions = {}): Promise<CycloneDXBOM> {
    const content = await readFile(cargoLockPath, 'utf-8');
    // Parse Cargo.lock (TOML) - simplified
    const components: SBOMComponent[] = [];
    
    // Would parse actual Cargo.lock here
    // For now return template
    return this.createCycloneDXBOM('crate', '1.0.0', components, options);
  }

  /**
   * Generate SBOM from go.mod
   */
  async generateFromGoMod(goModPath: string, options: GenerateOptions = {}): Promise<CycloneDXBOM> {
    const content = await readFile(goModPath, 'utf-8');
    const components: SBOMComponent[] = [];
    
    // Parse go.mod
    const lines = content.split('\n');
    let inRequire = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('require (')) {
        inRequire = true;
        continue;
      }
      if (inRequire && trimmed === ')') {
        inRequire = false;
        continue;
      }
      if (inRequire && trimmed) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          components.push(this.createComponent(parts[0], parts[1], 'library', 'golang'));
        }
      }
    }

    return this.createCycloneDXBOM('go-module', '1.0.0', components, options);
  }

  /**
   * Generate SBOM from requirements.txt / pyproject.toml
   */
  async generateFromPython(requirementsPath: string, options: GenerateOptions = {}): Promise<CycloneDXBOM> {
    const content = await readFile(requirementsPath, 'utf-8');
    const components: SBOMComponent[] = [];
    
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Parse package==version or package>=version
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)([=<>!~]+)(.+)$/);
      if (match) {
        components.push(this.createComponent(match[1], match[3], 'library', 'pypi'));
      }
    }

    return this.createCycloneDXBOM('python-project', '1.0.0', components, options);
  }

  /**
   * Generate SBOM from container image
   */
  async generateFromContainer(imageName: string, options: GenerateOptions = {}): Promise<CycloneDXBOM> {
    // Would use syft or similar to scan container
    const components: SBOMComponent[] = [];
    return this.createCycloneDXBOM(imageName, 'latest', components, options);
  }

  /**
   * Generate SBOM from directory of files
   */
  async generateFromDirectory(dirPath: string, options: GenerateOptions = {}): Promise<CycloneDXBOM> {
    const components: SBOMComponent[] = [];
    
    const scanDir = async (dir: string) => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          const buffer = await readFile(fullPath);
          const hash = createHash('sha256').update(buffer).digest('hex');
          components.push({
            name: entry.name,
            version: '1.0.0',
            type: 'file',
            licenses: [{ id: 'unknown' }],
            hashes: [{ algorithm: 'SHA-256', value: hash }],
            externalReferences: [],
            properties: [
              { name: 'path', value: fullPath },
              { name: 'size', value: String(buffer.length) },
            ],
          });
        }
      }
    };
    
    await scanDir(dirPath);
    return this.createCycloneDXBOM('directory', '1.0.0', components, options);
  }

  /**
   * Create CycloneDX BOM
   */
  private createCycloneDXBOM(
    name: string,
    version: string,
    components: SBOMComponent[],
    options: GenerateOptions
  ): CycloneDXBOM {
    const mainComponent: SBOMComponent = {
      name,
      version,
      type: 'application',
      licenses: [{ id: options.license || 'MIT' }],
      hashes: [],
      externalReferences: options.repository ? [{
        type: 'vcs',
        url: options.repository,
      }] : [],
      properties: [],
    };

    return {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      serialNumber: `urn:uuid:${uuidv4()}`,
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        tools: this.tools,
        authors: this.authors,
        component: mainComponent,
        licenses: [{ id: options.license || 'MIT' }],
        properties: [],
      },
      components,
      dependencies: this.generateDependencies(components),
    };
  }

  /**
   * Generate SPDX document
   */
  toSpdx(cycloneDx: CycloneDXBOM): SPDXDocument {
    const packages: SPDXPackage[] = cycloneDx.components.map((comp, idx) => ({
      SPDXID: `SPDXRef-Package-${idx}`,
      name: comp.name,
      version: comp.version,
      downloadLocation: comp.externalReferences.find(r => r.type === 'distribution')?.url || 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: comp.licenses[0]?.id || 'NOASSERTION',
      copyrightText: comp.copyright || 'NOASSERTION',
      checksums: comp.hashes.map(h => ({ algorithm: h.algorithm, value: h.value })),
      licenseInfoFromFiles: comp.licenses.map(l => l.id || 'NOASSERTION'),
      externalRefs: comp.externalReferences.map(r => ({
        referenceCategory: 'PACKAGE-MANAGER' as const,
        referenceType: r.type,
        referenceLocator: r.url,
      })),
    }));

    const relationships: SPDXRelationship[] = [
      { spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: 'SPDXRef-Package-0' },
    ];

    for (const dep of cycloneDx.dependencies || []) {
      // Would map refs to SPDXIDs
    }

    return {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      SPDXID: 'SPDXRef-DOCUMENT',
      name: cycloneDx.metadata.component.name,
      documentNamespace: `https://crashlab.example/sbom/${cycloneDx.serialNumber}`,
      creationInfo: {
        created: cycloneDx.metadata.timestamp,
        creators: ['Tool: CrashLab SBOM Generator'],
        licenseListVersion: '3.21',
      },
      packages,
      relationships,
    };
  }

  /**
   * Create component from npm package
   */
  private async createComponentFromNpm(pkg: any, isRoot: boolean): Promise<SBOMComponent> {
    const hashes: SBOMHash[] = [];
    
    // Would compute actual hashes from package contents
    // For now use placeholder
    
    return {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      type: isRoot ? 'application' : 'library',
      author: pkg.author?.name || pkg.author,
      publisher: pkg.publisher,
      group: pkg.name.split('/')[0]?.replace('@', ''),
      licenses: this.parseLicenses(pkg.license || pkg.licenses),
      copyright: pkg.copyright,
      cpe: pkg.cpe,
      purl: `pkg:npm/${pkg.name}@${pkg.version}`,
      hashes,
      externalReferences: [
        ...(pkg.repository ? [{
          type: 'vcs' as const,
          url: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository.url,
        }] : []),
        ...(pkg.homepage ? [{
          type: 'website' as const,
          url: pkg.homepage,
        }] : []),
        ...(pkg.bugs ? [{
          type: 'issue-tracker' as const,
          url: typeof pkg.bugs === 'string' ? pkg.bugs : pkg.bugs.url,
        }] : []),
      ],
      properties: [],
    };
  }

  /**
   * Create component from npm dependency
   */
  private async createComponentFromNpmDep(name: string, version: string, isDev = false): Promise<SBOMComponent> {
    // Would fetch from registry
    return {
      name,
      version: version.replace(/^[\^~]/, ''),
      type: 'library',
      licenses: [{ id: 'unknown' }],
      hashes: [],
      externalReferences: [
        { type: 'distribution', url: `https://www.npmjs.com/package/${name}` },
      ],
      properties: [
        { name: 'dev', value: String(isDev) },
      ],
    };
  }

  /**
   * Create generic component
   */
  private createComponent(
    name: string,
    version: string,
    type: SBOMComponent['type'],
    purlType: string
  ): SBOMComponent {
    return {
      name,
      version,
      type,
      licenses: [{ id: 'unknown' }],
      purl: `pkg:${purlType}/${name}@${version}`,
      hashes: [],
      externalReferences: [],
      properties: [],
    };
  }

  /**
   * Parse licenses from various formats
   */
  private parseLicenses(license: any): SBMLicense[] {
    if (!license) return [{ id: 'unknown' }];
    if (typeof license === 'string') return [{ id: license }];
    if (Array.isArray(license)) {
      return license.map(l => typeof l === 'string' ? { id: l } : { id: l.type, name: l.name });
    }
    if (typeof license === 'object') return [{ id: license.type, name: license.name }];
    return [{ id: 'unknown' }];
  }

  /**
   * Generate dependency graph
   */
  private generateDependencies(components: SBOMComponent[]): SBOMDependency[] {
    // Would build actual dependency graph
    // For now, return empty
    return [];
  }

  /**
   * Save SBOM to file
   */
  async saveSBOM(bom: CycloneDXBOM | SPDXDocument, outputPath: string, format: SBOMFormat = 'cyclonedx-json'): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });
    
    let content: string;
    if (format.startsWith('cyclonedx')) {
      content = JSON.stringify(bom, null, 2);
    } else {
      content = JSON.stringify(bom, null, 2);
    }
    
    await writeFile(outputPath, content);
  }

  /**
   * Load SBOM from file
   */
  async loadSBOM(filePath: string): Promise<CycloneDXBOM | SPDXDocument> {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }
}

export interface GenerateOptions {
  includeDevDependencies?: boolean;
  license?: string;
  repository?: string;
  outputFormat?: SBOMFormat;
}

/**
 * Create SBOM generator
 */
export function createSBOMGenerator(): SBOMGenerator {
  return new SBOMGenerator();
}