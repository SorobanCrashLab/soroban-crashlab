/**
 * YARA Engine
 * 
 * Executes YARA rules for pattern matching on artifacts.
 * Supports both native (yara command) and WASM-based execution.
 */

import { spawn, SpawnOptions } from 'node:child_process';
import { readFile, writeFile, mkdir, access, constants } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { ScanResult, ScanVerdict, ScanMatch, ScannerConfig, DEFAULT_SCANNER_CONFIG } from './ScanResult.js';

export interface YARARule {
  name: string;
  namespace: string;
  tags: string[];
  meta: Record<string, string>;
  strings: YARAString[];
  condition: string;
}

export interface YARAString {
  identifier: string;
  type: 'text' | 'hex' | 'regex';
  value: string;
  modifiers: string[];
}

export interface YARACompiledRules {
  path: string;
  rules: YARARule[];
  compiledAt: string;
  version: string;
}

export interface YARAEngineOptions {
  config: ScannerConfig;
  useWasm?: boolean;
  wasmModulePath?: string;
}

export class YARAEngine {
  private config: ScannerConfig;
  private useWasm: boolean;
  private wasmModule: any = null;
  private compiledRulesPath: string;
  private rulesLoaded = false;

  constructor(options: YARAEngineOptions) {
    this.config = options.config;
    this.useWasm = options.useWasm ?? false;
    this.compiledRulesPath = options.config.compiledRulesPath || '/etc/yara/compiled/rules.yar';
  }

  /**
   * Initialize the YARA engine
   */
  async initialize(): Promise<void> {
    if (this.useWasm) {
      await this.loadWasmModule();
    } else {
      await this.verifyNativeYara();
    }
    await this.ensureRulesCompiled();
    this.rulesLoaded = true;
  }

  /**
   * Load WASM-based YARA module
   */
  private async loadWasmModule(): Promise<void> {
    try {
      // Dynamic import for WASM module
      // This would typically be @yara-wasm/yara or similar
      const yaraWasm = await import('@yara-wasm/yara');
      this.wasmModule = yaraWasm;
    } catch (error) {
      throw new Error(`Failed to load YARA WASM module: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify native yara command is available
   */
  private async verifyNativeYara(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('yara', ['--version'], { stdio: 'pipe' });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('YARA command not found or failed'));
      });
      child.on('error', () => reject(new Error('YARA command not found')));
    });
  }

  /**
   * Ensure YARA rules are compiled
   */
  private async ensureRulesCompiled(): Promise<void> {
    try {
      await access(this.compiledRulesPath, constants.F_OK);
      return; // Already compiled
    } catch {
      // Need to compile rules
      await this.compileRules();
    }
  }

  /**
   * Compile YARA rules from source directory
   */
  async compileRules(rulesDir?: string): Promise<YARACompiledRules> {
    const sourceDir = rulesDir || this.config.rulesDirectory || '/etc/yara/rules';
    const outputDir = dirname(this.compiledRulesPath);
    
    await mkdir(outputDir, { recursive: true });

    if (this.useWasm && this.wasmModule) {
      return this.compileRulesWasm(sourceDir);
    } else {
      return this.compileRulesNative(sourceDir);
    }
  }

  /**
   * Compile rules using native yara command
   */
  private async compileRulesNative(sourceDir: string): Promise<YARACompiledRules> {
    return new Promise((resolve, reject) => {
      const child = spawn('yarac', [sourceDir, this.compiledRulesPath], {
        stdio: 'pipe',
      } as SpawnOptions);

      let stderr = '';
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('close', async (code) => {
        if (code === 0) {
          const rules = await this.parseRulesSource(sourceDir);
          resolve({
            path: this.compiledRulesPath,
            rules,
            compiledAt: new Date().toISOString(),
            version: '1.0',
          });
        } else {
          reject(new Error(`YARA compilation failed: ${stderr}`));
        }
      });

      child.on('error', (error) => reject(new Error(`YARA compilation error: ${error.message}`)));
    });
  }

  /**
   * Compile rules using WASM module
   */
  private async compileRulesWasm(sourceDir: string): Promise<YARACompiledRules> {
    if (!this.wasmModule) throw new Error('WASM module not loaded');

    // Read all .yar/.yara files
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(sourceDir);
    const ruleFiles = files.filter(f => f.endsWith('.yar') || f.endsWith('.yara'));

    let combinedSource = '';
    for (const file of ruleFiles) {
      const content = await readFile(join(sourceDir, file), 'utf-8');
      combinedSource += content + '\n';
    }

    // Compile with WASM
    const compiled = await this.wasmModule.compile(combinedSource);
    await writeFile(this.compiledRulesPath, compiled);

    const rules = await this.parseRulesSource(sourceDir);
    return {
      path: this.compiledRulesPath,
      rules,
      compiledAt: new Date().toISOString(),
      version: '1.0',
    };
  }

  /**
   * Parse YARA rule source files
   */
  private async parseRulesSource(sourceDir: string): Promise<YARARule[]> {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(sourceDir);
    const ruleFiles = files.filter(f => f.endsWith('.yar') || f.endsWith('.yara'));

    const rules: YARARule[] = [];
    
    for (const file of ruleFiles) {
      const content = await readFile(join(sourceDir, file), 'utf-8');
      const parsed = this.parseYARAContent(content, file);
      rules.push(...parsed);
    }

    return rules;
  }

  /**
   * Parse YARA rule content (simplified parser)
   */
  private parseYARAContent(content: string, sourceFile: string): YARARule[] {
    const rules: YARARule[] = [];
    const lines = content.split('\n');
    
    let currentRule: Partial<YARARule> | null = null;
    let inStrings = false;
    let inCondition = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Rule declaration
      if (trimmed.startsWith('rule ')) {
        if (currentRule) {
          rules.push(currentRule as YARARule);
        }
        const nameMatch = trimmed.match(/rule\s+(\w+)/);
        currentRule = {
          name: nameMatch?.[1] || 'unknown',
          namespace: 'default',
          tags: [],
          meta: {},
          strings: [],
          condition: '',
        };
        inStrings = false;
        inCondition = false;
      }
      // Tags
      else if (trimmed.startsWith(':') && currentRule) {
        currentRule.tags = trimmed.substring(1).split(/\s+/).filter(t => t);
      }
      // Meta section
      else if (trimmed === 'meta:' && currentRule) {
        inStrings = false;
        inCondition = false;
      }
      // Strings section
      else if (trimmed === 'strings:' && currentRule) {
        inStrings = true;
        inCondition = false;
      }
      // Condition section
      else if (trimmed === 'condition:' && currentRule) {
        inStrings = false;
        inCondition = true;
      }
      // Meta entries
      else if (inStrings === false && inCondition === false && currentRule && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        currentRule.meta[key.trim()] = valueParts.join('=').trim().replace(/^"|"$/g, '');
      }
      // String definitions
      else if (inStrings && currentRule && trimmed.startsWith('$')) {
        const stringMatch = trimmed.match(/\$(\w+)\s*=\s*(.+)/);
        if (stringMatch) {
          const [, identifier, value] = stringMatch;
          let type: 'text' | 'hex' | 'regex' = 'text';
          let stringValue = value.trim();
          
          if (stringValue.startsWith('/') && stringValue.endsWith('/')) {
            type = 'regex';
            stringValue = stringValue.slice(1, -1);
          } else if (stringValue.startsWith('{') && stringValue.endsWith('}')) {
            type = 'hex';
            stringValue = stringValue.slice(1, -1);
          } else {
            stringValue = stringValue.replace(/^"|"$/g, '');
          }
          
          currentRule.strings!.push({
            identifier,
            type,
            value: stringValue,
            modifiers: [],
          });
        }
      }
      // Condition
      else if (inCondition && currentRule) {
        currentRule.condition += (currentRule.condition ? ' ' : '') + trimmed;
      }
    }

    if (currentRule) {
      rules.push(currentRule as YARARule);
    }

    return rules;
  }

  /**
   * Scan a buffer using YARA
   */
  async scanBuffer(buffer: Buffer): Promise<ScanResult> {
    if (!this.rulesLoaded) await this.initialize();

    const startTime = Date.now();

    try {
      if (this.useWasm && this.wasmModule) {
        return this.scanBufferWasm(buffer, startTime);
      } else {
        return this.scanBufferNative(buffer, startTime);
      }
    } catch (error) {
      return {
        verdict: 'error',
        scanner: 'yara',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        matches: [],
        error: error instanceof Error ? error.message : 'Unknown YARA error',
        scannedBytes: buffer.length,
      };
    }
  }

  /**
   * Scan buffer using native yara command
   */
  private async scanBufferNative(buffer: Buffer, startTime: number): Promise<ScanResult> {
    // Write buffer to temp file
    const tempFile = join(tmpdir(), `yara-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await writeFile(tempFile, buffer);

    try {
      return new Promise((resolve, reject) => {
        const child = spawn('yara', [
          '-C', // Compiled rules
          '-w', // No warnings
          '-f', // Fast mode
          this.compiledRulesPath,
          tempFile
        ], { stdio: 'pipe', timeout: this.config.timeoutMs } as SpawnOptions);

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => { stdout += data.toString(); });
        child.stderr?.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
          const durationMs = Date.now() - startTime;
          
          // Cleanup temp file
          import('node:fs/promises').then(fs => fs.unlink(tempFile).catch(() => {}));

          if (code === 0 || code === 1) {
            // 0 = no matches, 1 = matches found
            const matches = this.parseYARAOutput(stdout);
            resolve({
              verdict: matches.length > 0 ? 'infected' : 'clean',
              scanner: 'yara',
              timestamp: new Date().toISOString(),
              durationMs,
              matches,
              scannedBytes: buffer.length,
            });
          } else if (code === 2) {
            // Timeout
            resolve({
              verdict: 'timeout',
              scanner: 'yara',
              timestamp: new Date().toISOString(),
              durationMs,
              matches: [],
              error: 'YARA scan timeout',
              scannedBytes: buffer.length,
            });
          } else {
            resolve({
              verdict: 'error',
              scanner: 'yara',
              timestamp: new Date().toISOString(),
              durationMs,
              matches: [],
              error: stderr || `YARA exited with code ${code}`,
              scannedBytes: buffer.length,
            });
          }
        });

        child.on('error', (error) => {
          import('node:fs/promises').then(fs => fs.unlink(tempFile).catch(() => {}));
          reject(error);
        });
      });
    } catch (error) {
      await import('node:fs/promises').then(fs => fs.unlink(tempFile).catch(() => {}));
      throw error;
    }
  }

  /**
   * Scan buffer using WASM module
   */
  private async scanBufferWasm(buffer: Buffer, startTime: number): Promise<ScanResult> {
    if (!this.wasmModule) throw new Error('WASM module not loaded');

    try {
      // Load compiled rules
      const rules = await this.wasmModule.loadRules(this.compiledRulesPath);
      
      // Scan buffer
      const matches = await rules.scan(buffer);
      
      const durationMs = Date.now() - startTime;
      
      return {
        verdict: matches.length > 0 ? 'infected' : 'clean',
        scanner: 'yara',
        timestamp: new Date().toISOString(),
        durationMs,
        matches: matches.map((m: any) => ({
          rule: m.rule,
          namespace: m.namespace || 'default',
          tags: m.tags || [],
          meta: m.meta || {},
          offset: m.offset || 0,
          length: m.length || 0,
        })),
        scannedBytes: buffer.length,
      };
    } catch (error) {
      return {
        verdict: 'error',
        scanner: 'yara',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        matches: [],
        error: error instanceof Error ? error.message : 'WASM scan error',
        scannedBytes: buffer.length,
      };
    }
  }

  /**
   * Parse YARA command output
   */
  private parseYARAOutput(output: string): ScanMatch[] {
    const matches: ScanMatch[] = [];
    const lines = output.trim().split('\n').filter(l => l.trim());

    for (const line of lines) {
      // Format: rule_name namespace file_path
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        matches.push({
          rule: parts[0],
          namespace: parts[1],
          tags: [],
          meta: {},
          offset: 0,
          length: 0,
        });
      }
    }

    return matches;
  }

  /**
   * Scan a file using YARA
   */
  async scanFile(filePath: string): Promise<ScanResult> {
    if (!this.rulesLoaded) await this.initialize();

    const startTime = Date.now();

    try {
      if (this.useWasm && this.wasmModule) {
        const buffer = await readFile(filePath);
        return this.scanBufferWasm(buffer, startTime);
      } else {
        return new Promise((resolve, reject) => {
          const child = spawn('yara', [
            '-C', '-w', '-f',
            this.compiledRulesPath,
            filePath
          ], { stdio: 'pipe', timeout: this.config.timeoutMs } as SpawnOptions);

          let stdout = '';
          let stderr = '';

          child.stdout?.on('data', (data) => { stdout += data.toString(); });
          child.stderr?.on('data', (data) => { stderr += data.toString(); });

          child.on('close', (code) => {
            const durationMs = Date.now() - startTime;

            if (code === 0 || code === 1) {
              const matches = this.parseYARAOutput(stdout);
              resolve({
                verdict: matches.length > 0 ? 'infected' : 'clean',
                scanner: 'yara',
                timestamp: new Date().toISOString(),
                durationMs,
                matches,
                scannedBytes: 0, // Would need stat
              });
            } else if (code === 2) {
              resolve({
                verdict: 'timeout',
                scanner: 'yara',
                timestamp: new Date().toISOString(),
                durationMs,
                matches: [],
                error: 'YARA scan timeout',
                scannedBytes: 0,
              });
            } else {
              resolve({
                verdict: 'error',
                scanner: 'yara',
                timestamp: new Date().toISOString(),
                durationMs,
                matches: [],
                error: stderr || `YARA exited with code ${code}`,
                scannedBytes: 0,
              });
            }
          });

          child.on('error', reject);
        });
      }
    } catch (error) {
      return {
        verdict: 'error',
        scanner: 'yara',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        matches: [],
        error: error instanceof Error ? error.message : 'Unknown YARA error',
        scannedBytes: 0,
      };
    }
  }

  /**
   * Get loaded rules
   */
  getRules(): YARARule[] {
    // Would need to store parsed rules
    return [];
  }

  /**
   * Reload rules
   */
  async reload(): Promise<void> {
    this.rulesLoaded = false;
    await this.initialize();
  }
}

/**
 * Create YARA engine with environment-based configuration
 */
export function createYARAEngine(useWasm = false): YARAEngine {
  return new YARAEngine({
    config: {
      ...DEFAULT_SCANNER_CONFIG,
      rulesDirectory: process.env.YARA_RULES_DIR,
      compiledRulesPath: process.env.YARA_COMPILED_RULES,
    },
    useWasm,
  });
}