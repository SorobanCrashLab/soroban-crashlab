/**
 * Provenance Builder
 * 
 * Builds SLSA provenance from build system information.
 * Collects build metadata, dependencies, and environment for attestation.
 */

import { createHash } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { SLSAProvenance, SLSAProvenancePredicate, SLSAArtifact, SLSABuildDefinition, SLSARunDetails, SLSABuilder, SLSAMetadata, BuildInfo } from './SLSAAttestation.js';

export interface BuildContext {
  buildId: string;
  buildUrl: string;
  buildType: string;
  sourceRepo: string;
  sourceCommit: string;
  sourceBranch: string;
  sourceTag?: string;
  builderId: string;
  builderVersion: string;
  buildCommand: string[];
  buildEnvironment: Record<string, string>;
  artifacts: BuildArtifact[];
  dependencies: Dependency[];
  startedAt: string;
  isReproducible: boolean;
}

export interface BuildArtifact {
  name: string;
  path: string;
  type: 'binary' | 'library' | 'package' | 'container' | 'wasm' | 'other';
}

export interface Dependency {
  name: string;
  version: string;
  digest: Record<string, string>;
  sourceRepo?: string;
  sourceCommit?: string;
  type: 'direct' | 'transitive' | 'dev' | 'optional';
}

export interface ProvenanceOptions {
  outputPath?: string;
  includeEnvironment?: boolean;
  includeDependencies?: boolean;
  sign?: boolean;
  privateKeyPath?: string;
}

export class ProvenanceBuilder {
  private context: Partial<BuildContext> = {};

  /**
   * Set build context from CI environment
   */
  static fromCIEnvironment(): ProvenanceBuilder {
    const builder = new ProvenanceBuilder();
    
    // GitHub Actions
    if (process.env.GITHUB_ACTIONS === 'true') {
      builder.context = {
        buildId: process.env.GITHUB_RUN_ID,
        buildUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        buildType: 'github-actions',
        sourceRepo: `https://github.com/${process.env.GITHUB_REPOSITORY}`,
        sourceCommit: process.env.GITHUB_SHA || '',
        sourceBranch: process.env.GITHUB_REF_NAME || process.env.GITHUB_REF?.replace('refs/heads/', '') || '',
        sourceTag: process.env.GITHUB_REF?.startsWith('refs/tags/') ? process.env.GITHUB_REF.replace('refs/tags/', '') : undefined,
        builderId: 'https://github.com/actions/runner',
        builderVersion: process.env.RUNNER_VERSION || 'unknown',
        buildCommand: process.env.GITHUB_WORKFLOW ? [process.env.GITHUB_WORKFLOW] : [],
        buildEnvironment: ProvenanceBuilder.filterEnv(process.env),
        startedAt: new Date().toISOString(),
        isReproducible: false,
        artifacts: [],
        dependencies: [],
      };
    }
    // GitLab CI
    else if (process.env.GITLAB_CI === 'true') {
      builder.context = {
        buildId: process.env.CI_PIPELINE_ID,
        buildUrl: `${process.env.CI_PROJECT_URL}/pipelines/${process.env.CI_PIPELINE_ID}`,
        buildType: 'gitlab-ci',
        sourceRepo: process.env.CI_PROJECT_URL || '',
        sourceCommit: process.env.CI_COMMIT_SHA || '',
        sourceBranch: process.env.CI_COMMIT_REF_NAME || '',
        sourceTag: process.env.CI_COMMIT_TAG || undefined,
        builderId: 'https://gitlab.com/gitlab-org/gitlab-runner',
        builderVersion: process.env.CI_RUNNER_VERSION || 'unknown',
        buildCommand: process.env.CI_JOB_NAME ? [process.env.CI_JOB_NAME] : [],
        buildEnvironment: ProvenanceBuilder.filterEnv(process.env),
        startedAt: new Date().toISOString(),
        isReproducible: false,
        artifacts: [],
        dependencies: [],
      };
    }
    // Generic CI
    else if (process.env.CI === 'true') {
      builder.context = {
        buildId: process.env.BUILD_ID || process.env.BUILD_NUMBER || uuidv4(),
        buildUrl: process.env.BUILD_URL || '',
        buildType: 'generic-ci',
        sourceRepo: process.env.SOURCE_REPO || '',
        sourceCommit: process.env.SOURCE_COMMIT || process.env.GIT_COMMIT || '',
        sourceBranch: process.env.SOURCE_BRANCH || process.env.GIT_BRANCH || '',
        builderId: 'unknown',
        builderVersion: 'unknown',
        buildCommand: [],
        buildEnvironment: ProvenanceBuilder.filterEnv(process.env),
        startedAt: new Date().toISOString(),
        isReproducible: false,
        artifacts: [],
        dependencies: [],
      };
    }

    return builder;
  }

  /**
   * Filter environment variables for provenance
   */
  static filterEnv(env: Record<string, string | undefined>): Record<string, string> {
    const filtered: Record<string, string> = {};
    const allowedPrefixes = ['CI_', 'GITHUB_', 'GITLAB_', 'BUILD_', 'SOURCE_', 'NODE_', 'NPM_', 'CARGO_', 'GO_', 'PYTHON_', 'JAVA_', 'RUST_'];
    const allowedExact = ['PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL', 'TZ'];
    
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) continue;
      if (allowedExact.includes(key)) {
        filtered[key] = value;
      } else if (allowedPrefixes.some(p => key.startsWith(p))) {
        filtered[key] = value;
      }
    }
    
    return filtered;
  }

  /**
   * Add artifact
   */
  addArtifact(artifact: BuildArtifact): this {
    this.context.artifacts = [...(this.context.artifacts || []), artifact];
    return this;
  }

  /**
   * Add multiple artifacts
   */
  addArtifacts(artifacts: BuildArtifact[]): this {
    this.context.artifacts = [...(this.context.artifacts || []), ...artifacts];
    return this;
  }

  /**
   * Add dependency
   */
  addDependency(dependency: Dependency): this {
    this.context.dependencies = [...(this.context.dependencies || []), dependency];
    return this;
  }

  /**
   * Add multiple dependencies
   */
  addDependencies(dependencies: Dependency[]): this {
    this.context.dependencies = [...(this.context.dependencies || []), ...dependencies];
    return this;
  }

  /**
   * Set reproducible flag
   */
  setReproducible(reproducible: boolean): this {
    this.context.isReproducible = reproducible;
    return this;
  }

  /**
   * Set build finished time
   */
  setFinishedAt(finishedAt: string = new Date().toISOString()): this {
    this.context.finishedAt = finishedAt;
    return this;
  }

  /**
   * Build provenance
   */
  build(): SLSAProvenance {
    const ctx = this.context as BuildContext;
    
    if (!ctx.buildId || !ctx.sourceRepo || !ctx.sourceCommit) {
      throw new Error('Missing required build context: buildId, sourceRepo, sourceCommit');
    }

    const subject: SLSAArtifact[] = ctx.artifacts.map(artifact => {
      // In real implementation, compute actual digests
      return {
        name: artifact.name,
        digest: {
          sha256: 'placeholder-digest', // Would compute actual hash
        },
      };
    });

    const buildDefinition: SLSABuildDefinition = {
      buildType: ctx.buildType,
      externalParameters: {
        sourceRepo: ctx.sourceRepo,
        sourceCommit: ctx.sourceCommit,
        sourceBranch: ctx.sourceBranch,
        sourceTag: ctx.sourceTag,
        buildCommand: ctx.buildCommand,
      },
      internalParameters: {
        buildId: ctx.buildId,
        buildUrl: ctx.buildUrl,
        builderId: ctx.builderId,
        builderVersion: ctx.builderVersion,
      },
      resolvedDependencies: ctx.dependencies.map(dep => ({
        name: dep.name,
        digest: dep.digest,
      })),
      environment: ctx.buildEnvironment,
    };

    const runDetails: SLSARunDetails = {
      builder: {
        id: ctx.builderId,
        version: ctx.builderVersion,
        builderDependencies: ctx.dependencies.map(dep => ({
          name: dep.name,
          digest: dep.digest,
        })),
      },
      metadata: {
        invocationId: ctx.buildId,
        startedOn: ctx.startedAt,
        finishedOn: ctx.finishedAt || new Date().toISOString(),
        completeness: {
          parameters: true,
          environment: true,
          materials: true,
        },
        reproducible: ctx.isReproducible,
      },
      byproducts: [],
    };

    return {
      _type: 'https://in-toto.io/Statement/v0.1',
      subject,
      predicateType: 'https://slsa.dev/provenance/v1',
      predicate: {
        buildDefinition,
        runDetails,
      },
    };
  }

  /**
   * Save provenance to file
   */
  async save(outputPath?: string): Promise<string> {
    const provenance = this.build();
    const path = outputPath || `/tmp/provenance-${uuidv4()}.json`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(provenance, null, 2));
    return path;
  }

  /**
   * Load provenance from file
   */
  static async load(filePath: string): Promise<SLSAProvenance> {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Compute artifact digest
   */
  static async computeDigest(filePath: string, algorithm: string = 'sha256'): Promise<string> {
    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(filePath);
    return createHash(algorithm).update(buffer).digest('hex');
  }

  /**
   * Compute digests for multiple algorithms
   */
  static async computeDigests(filePath: string, algorithms: string[] = ['sha256', 'sha512']): Promise<Record<string, string>> {
    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(filePath);
    const digests: Record<string, string> = {};
    
    for (const algo of algorithms) {
      digests[algo] = createHash(algo).update(buffer).digest('hex');
    }
    
    return digests;
  }

  /**
   * Update provenance with actual artifact digests
   */
  async updateWithDigests(artifactPaths: Record<string, string>): Promise<SLSAProvenance> {
    const provenance = this.build();
    
    for (const subject of provenance.subject) {
      const path = artifactPaths[subject.name];
      if (path) {
        subject.digest = await ProvenanceBuilder.computeDigests(path);
      }
    }

    return provenance;
  }
}

/**
 * GitHub Actions Provenance Builder - specialized for GH Actions
 */
export class GitHubActionsProvenanceBuilder extends ProvenanceBuilder {
  constructor() {
    super();
    this.context = ProvenanceBuilder.fromCIEnvironment().context;
  }

  /**
   * Add workflow context
   */
  withWorkflow(workflow: string, job: string): this {
    this.context.buildCommand = [workflow, job];
    return this;
  }

  /**
   * Add runner info
   */
  withRunner(runnerId: string, runnerVersion: string): this {
    this.context.builderId = runnerId;
    this.context.builderVersion = runnerVersion;
    return this;
  }

  /**
   * Add artifacts from GitHub Actions upload
   */
  withUploadedArtifacts(artifacts: Array<{ name: string; path: string }>): this {
    this.context.artifacts = artifacts.map(a => ({
      name: a.name,
      path: a.path,
      type: 'binary' as const,
    }));
    return this;
  }
}

/**
 * Create provenance builder
 */
export function createProvenanceBuilder(): ProvenanceBuilder {
  return new ProvenanceBuilder();
}

/**
 * Create GitHub Actions provenance builder
 */
export function createGitHubActionsProvenanceBuilder(): GitHubActionsProvenanceBuilder {
  return new GitHubActionsProvenanceBuilder();
}