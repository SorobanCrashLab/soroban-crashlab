/**
 * YARA Rule Manager
 * 
 * Manages custom YARA rules for detecting packers, cryptominers, exploits, etc.
 * Handles rule updates, validation, and compilation.
 */

import { writeFile, readFile, mkdir, readdir, rm, copyFile, stat } from 'node:fs/promises';
import { join, dirname, basename, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { YARAEngine } from './YARAEngine.js';
import { YARARule, YARACompiledRules } from './YARAEngine.js';

export interface RuleSource {
  name: string;
  version: string;
  description: string;
  author: string;
  url: string;
  rules: string[];
  lastUpdated: string;
  checksum: string;
}

export interface RuleSet {
  id: string;
  name: string;
  description: string;
  version: string;
  sources: RuleSource[];
  rules: YARARule[];
  compiledAt?: string;
  enabled: boolean;
}

export interface RuleUpdateResult {
  success: boolean;
  ruleSetId: string;
  rulesAdded: number;
  rulesUpdated: number;
  rulesRemoved: number;
  errors: string[];
  compiledPath?: string;
}

export class RuleManager {
  private rulesDirectory: string;
  private compiledRulesPath: string;
  private ruleSets: Map<string, RuleSet> = new Map();
  private yaraEngine: YARAEngine | null = null;

  constructor(
    rulesDirectory: string = '/etc/yara/rules',
    compiledRulesPath: string = '/etc/yara/compiled/rules.yar'
  ) {
    this.rulesDirectory = rulesDirectory;
    this.compiledRulesPath = compiledRulesPath;
  }

  /**
   * Set YARA engine for compilation
   */
  setYaraEngine(engine: YARAEngine): void {
    this.yaraEngine = engine;
  }

  /**
   * Initialize rule manager
   */
  async initialize(): Promise<void> {
    await mkdir(this.rulesDirectory, { recursive: true });
    await mkdir(dirname(this.compiledRulesPath), { recursive: true });
    await this.loadRuleSets();
  }

  /**
   * Load all rule sets from directory
   */
  private async loadRuleSets(): Promise<void> {
    try {
      const entries = await readdir(this.rulesDirectory, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadRuleSet(entry.name);
        }
      }
    } catch (error) {
      console.warn('Failed to load rule sets:', error);
    }
  }

  /**
   * Load a specific rule set
   */
  async loadRuleSet(ruleSetId: string): Promise<RuleSet | null> {
    const ruleSetDir = join(this.rulesDirectory, ruleSetId);
    const metaPath = join(ruleSetDir, 'meta.json');

    try {
      const metaContent = await readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);

      const { readdir } = await import('node:fs/promises');
      const files = await readdir(ruleSetDir);
      const ruleFiles = files.filter(f => f.endsWith('.yar') || f.endsWith('.yara'));

      const rules: YARARule[] = [];
      for (const file of ruleFiles) {
        const content = await readFile(join(ruleSetDir, file), 'utf-8');
        const parsed = this.parseYARAContent(content, file);
        rules.push(...parsed);
      }

      const ruleSet: RuleSet = {
        id: ruleSetId,
        name: meta.name || ruleSetId,
        description: meta.description || '',
        version: meta.version || '1.0.0',
        sources: meta.sources || [],
        rules,
        enabled: meta.enabled !== false,
      };

      this.ruleSets.set(ruleSetId, ruleSet);
      return ruleSet;
    } catch (error) {
      console.warn(`Failed to load rule set ${ruleSetId}:`, error);
      return null;
    }
  }

  /**
   * Parse YARA content
   */
  private parseYARAContent(content: string, sourceFile: string): YARARule[] {
    const rules: YARARule[] = [];
    const lines = content.split('\n');
    
    let currentRule: Partial<YARARule> | null = null;
    let inStrings = false;
    let inCondition = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
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
      else if (trimmed.startsWith(':') && currentRule) {
        currentRule.tags = trimmed.substring(1).split(/\s+/).filter(t => t);
      }
      else if (trimmed === 'meta:' && currentRule) {
        inStrings = false;
        inCondition = false;
      }
      else if (trimmed === 'strings:' && currentRule) {
        inStrings = true;
        inCondition = false;
      }
      else if (trimmed === 'condition:' && currentRule) {
        inStrings = false;
        inCondition = true;
      }
      else if (!inStrings && !inCondition && currentRule && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        currentRule.meta[key.trim()] = valueParts.join('=').trim().replace(/^"|"$/g, '');
      }
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
   * Get all rule sets
   */
  getRuleSets(): RuleSet[] {
    return Array.from(this.ruleSets.values());
  }

  /**
   * Get a specific rule set
   */
  getRuleSet(id: string): RuleSet | undefined {
    return this.ruleSets.get(id);
  }

  /**
   * Get all rules (enabled rule sets only)
   */
  getAllRules(): YARARule[] {
    const rules: YARARule[] = [];
    for (const ruleSet of this.ruleSets.values()) {
      if (ruleSet.enabled) {
        rules.push(...ruleSet.rules);
      }
    }
    return rules;
  }

  /**
   * Add or update a rule set from source
   */
  async updateRuleSet(
    ruleSetId: string,
    source: RuleSource,
    rulesContent: string[]
  ): Promise<RuleUpdateResult> {
    const ruleSetDir = join(this.rulesDirectory, ruleSetId);
    await mkdir(ruleSetDir, { recursive: true });

    const result: RuleUpdateResult = {
      success: false,
      ruleSetId,
      rulesAdded: 0,
      rulesUpdated: 0,
      rulesRemoved: 0,
      errors: [],
    };

    try {
      // Write meta.json
      await writeFile(join(ruleSetDir, 'meta.json'), JSON.stringify({
        name: source.name,
        description: source.description,
        version: source.version,
        author: source.author,
        url: source.url,
        lastUpdated: new Date().toISOString(),
        checksum: source.checksum,
        enabled: true,
      }, null, 2));

      // Write rule files
      for (let i = 0; i < rulesContent.length; i++) {
        const fileName = source.rules[i] || `rule-${i}.yar`;
        await writeFile(join(ruleSetDir, fileName), rulesContent[i]);
      }

      // Reload rule set
      const ruleSet = await this.loadRuleSet(ruleSetId);
      if (ruleSet) {
        result.rulesAdded = ruleSet.rules.length;
        result.success = true;
      }

      // Recompile if engine available
      if (this.yaraEngine) {
        const compiled = await this.yaraEngine.compileRules(this.rulesDirectory);
        result.compiledPath = compiled.path;
      }

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Download and install rule set from URL
   */
  async installRuleSetFromUrl(
    ruleSetId: string,
    url: string,
    expectedChecksum?: string
  ): Promise<RuleUpdateResult> {
    const result: RuleUpdateResult = {
      success: false,
      ruleSetId,
      rulesAdded: 0,
      rulesUpdated: 0,
      rulesRemoved: 0,
      errors: [],
    };

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      
      // Verify checksum if provided
      if (expectedChecksum) {
        const crypto = await import('node:crypto');
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        if (hash !== expectedChecksum) {
          throw new Error('Checksum mismatch');
        }
      }

      // Parse as rule source
      const source: RuleSource = {
        name: ruleSetId,
        version: '1.0.0',
        description: `Downloaded from ${url}`,
        author: 'remote',
        url,
        rules: [basename(url)],
        lastUpdated: new Date().toISOString(),
        checksum: expectedChecksum || '',
      };

      return this.updateRuleSet(ruleSetId, source, [content]);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Enable/disable a rule set
   */
  async setRuleSetEnabled(ruleSetId: string, enabled: boolean): Promise<boolean> {
    const ruleSet = this.ruleSets.get(ruleSetId);
    if (!ruleSet) return false;

    ruleSet.enabled = enabled;
    
    const metaPath = join(this.rulesDirectory, ruleSetId, 'meta.json');
    try {
      await writeFile(metaPath, JSON.stringify({
        name: ruleSet.name,
        description: ruleSet.description,
        version: ruleSet.version,
        enabled,
      }, null, 2));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a rule set
   */
  async deleteRuleSet(ruleSetId: string): Promise<boolean> {
    const ruleSetDir = join(this.rulesDirectory, ruleSetId);
    try {
      await rm(ruleSetDir, { recursive: true, force: true });
      this.ruleSets.delete(ruleSetId);
      
      // Recompile
      if (this.yaraEngine) {
        await this.yaraEngine.compileRules(this.rulesDirectory);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Compile all enabled rules
   */
  async compileAllRules(): Promise<YARACompiledRules | null> {
    if (!this.yaraEngine) return null;
    return this.yaraEngine.compileRules(this.rulesDirectory);
  }

  /**
   * Validate rule syntax
   */
  async validateRuleSyntax(content: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Write to temp file
    const tempFile = join(tmpdir(), `yara-validate-${Date.now()}.yar`);
    await writeFile(tempFile, content);

    try {
      if (this.yaraEngine) {
        // Use engine to validate
        const result = await this.yaraEngine.scanBuffer(Buffer.from('test'));
        await import('node:fs/promises').then(fs => fs.unlink(tempFile).catch(() => {}));
        return { valid: result.verdict !== 'error', errors: result.error ? [result.error] : [] };
      } else {
        // Use native yarac
        const { spawn } = await import('node:child_process');
        return new Promise((resolve) => {
          const child = spawn('yarac', [tempFile, '/dev/null'], { stdio: 'pipe' });
          let stderr = '';
          child.stderr?.on('data', (data) => { stderr += data.toString(); });
          child.on('close', (code) => {
            import('node:fs/promises').then(fs => fs.unlink(tempFile).catch(() => {}));
            resolve({ valid: code === 0, errors: code === 0 ? [] : [stderr] });
          });
          child.on('error', () => {
            import('node:fs/promises').then(fs => fs.unlink(tempFile).catch(() => {}));
            resolve({ valid: false, errors: ['yarac not found'] });
          });
        });
      }
    } catch (error) {
      await import('node:fs/promises').then(fs => fs.unlink(tempFile).catch(() => {}));
      return { valid: false, errors: [error instanceof Error ? error.message : 'Unknown error'] };
    }
  }

  /**
   * Get built-in rule templates
   */
  getBuiltInRuleTemplates(): Record<string, string> {
    return {
      packers: `
rule UPX_Packed {
    meta:
        description = "UPX packer detection"
        author = "CrashLab"
        severity = "medium"
    strings:
        $upx1 = "UPX!" ascii wide
        $upx2 = "UPX0" ascii wide
        $upx3 = "UPX1" ascii wide
    condition:
        any of them
}

rule ASPack_Packed {
    meta:
        description = "ASPack packer detection"
        author = "CrashLab"
        severity = "medium"
    strings:
        $aspack = "ASPack" ascii wide
    condition:
        $aspack
}

rule MPRESS_Packed {
    meta:
        description = "MPRESS packer detection"
        author = "CrashLab"
        severity = "medium"
    strings:
        $mpress = "MPRESS" ascii wide
    condition:
        $mpress
}
`,
      cryptominers: `
rule XMRig_Miner {
    meta:
        description = "XMRig cryptominer detection"
        author = "CrashLab"
        severity = "high"
        tags = ["cryptominer", "malware"]
    strings:
        $xmrig1 = "xmrig" ascii wide nocase
        $xmrig2 = "donate-level" ascii wide
        $xmrig3 = "pools" ascii wide
        $stratum = "stratum+tcp://" ascii wide
    condition:
        ($xmrig1 and $xmrig2) or ($xmrig1 and $stratum) or (2 of ($xmrig*))
}

rule CoinHive_Miner {
    meta:
        description = "CoinHive browser miner detection"
        author = "CrashLab"
        severity = "high"
        tags = ["cryptominer", "browser"]
    strings:
        $coinhive1 = "coinhive" ascii wide nocase
        $coinhive2 = "coin-hive" ascii wide nocase
        $authedmine = "authedmine" ascii wide nocase
    condition:
        any of them
}

rule Generic_Cryptominer {
    meta:
        description = "Generic cryptominer patterns"
        author = "CrashLab"
        severity = "medium"
        tags = ["cryptominer"]
    strings:
        $stratum1 = "stratum+tcp://" ascii wide
        $stratum2 = "stratum+ssl://" ascii wide
        $getwork = "getwork" ascii wide
        $submit = "submit" ascii wide
        $difficulty = "difficulty" ascii wide
        $hashrate = "hashrate" ascii wide
    condition:
        3 of them
}
`,
      exploits: `
rule Shellcode_Exec {
    meta:
        description = "Shellcode execution patterns"
        author = "CrashLab"
        severity = "critical"
        tags = ["exploit", "shellcode"]
    strings:
        $execve = { 6a 3b 58 99 52 68 2f 2f 73 68 68 2f 62 69 6e 89 e3 52 53 89 e1 cd 80 }
        $execve2 = { 48 31 ff 57 57 5e 5a 48 bf 2f 2f 62 69 6e 2f 73 68 48 c1 ef 08 57 54 5f 6a 3b 58 0f 05 }
        $binsh = "/bin/sh" ascii wide
        $cmd = "cmd.exe" ascii wide
    condition:
        any of them
}

rule Buffer_Overflow_Pattern {
    meta:
        description = "Common buffer overflow patterns"
        author = "CrashLab"
        severity = "high"
        tags = ["exploit", "overflow"]
    strings:
        $nopsled1 = { 90 90 90 90 90 90 90 90 90 90 90 90 90 90 90 90 }
        $nopsled2 = { 90 90 90 90 90 90 90 90 90 90 90 90 90 90 90 90 90 90 90 90 }
        $ret_sled = { c3 c3 c3 c3 c3 c3 c3 c3 c3 c3 c3 c3 c3 c3 c3 c3 }
    condition:
        any of them
}

rule ROP_Gadgets {
    meta:
        description = "Return-oriented programming gadgets"
        author = "CrashLab"
        severity = "high"
        tags = ["exploit", "rop"]
    strings:
        $pop_ret = { 5? c3 }
        $pop_pop_ret = { 5? 5? c3 }
        $xchg_esp = { 94 c3 }
    condition:
        $pop_pop_ret or $xchg_esp
}
`,
      suspicious: `
rule Suspicious_PE_Characteristics {
    meta:
        description = "Suspicious PE file characteristics"
        author = "CrashLab"
        severity = "medium"
        tags = ["pe", "suspicious"]
    strings:
        $mz = "MZ" at 0
        $pe = "PE\0\0" at 0x3c
        $upx_section = "UPX" ascii
        $packed_section = { 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 }
    condition:
        $mz and $pe and ($upx_section or $packed_section)
}

rule Embedded_Executable {
    meta:
        description = "Embedded executable in data file"
        author = "CrashLab"
        severity = "medium"
        tags = ["embedded", "executable"]
    strings:
        $mz = "MZ" ascii
        $pe = "PE\0\0" ascii
    condition:
        $mz and $pe and filesize > 1MB
}

rule Obfuscated_Script {
    meta:
        description = "Heavily obfuscated script content"
        author = "CrashLab"
        severity = "medium"
        tags = ["obfuscation", "script"]
    strings:
        $eval = "eval(" ascii wide nocase
        $base64 = "base64" ascii wide nocase
        $fromcharcode = "fromCharCode" ascii wide nocase
        $unescape = "unescape(" ascii wide nocase
        $replace = ".replace(" ascii wide nocase
    condition:
        3 of them and filesize > 10KB
}
`,
    };
  }

  /**
   * Initialize built-in rule sets
   */
  async initializeBuiltInRules(): Promise<RuleUpdateResult[]> {
    const templates = this.getBuiltInRuleTemplates();
    const results: RuleUpdateResult[] = [];

    for (const [name, content] of Object.entries(templates)) {
      const source: RuleSource = {
        name: `Built-in: ${name}`,
        version: '1.0.0',
        description: `Built-in ${name} detection rules`,
        author: 'CrashLab',
        url: 'internal://builtin',
        rules: [`${name}.yar`],
        lastUpdated: new Date().toISOString(),
        checksum: '',
      };

      const result = await this.updateRuleSet(`builtin-${name}`, source, [content]);
      results.push(result);
    }

    return results;
  }
}

/**
 * Create a rule manager with default paths
 */
export function createRuleManager(
  rulesDir?: string,
  compiledPath?: string
): RuleManager {
  return new RuleManager(
    rulesDir || process.env.YARA_RULES_DIR || '/etc/yara/rules',
    compiledPath || process.env.YARA_COMPILED_RULES || '/etc/yara/compiled/rules.yar'
  );
}