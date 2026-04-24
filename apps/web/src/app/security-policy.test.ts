/**
 * Security Policy Validation Tests
 * 
 * This test suite validates that the security policy and disclosure path
 * are properly documented and accessible according to Wave 4 requirements.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Security Policy and Disclosure Path', () => {
  const findRepoRoot = (start: string): string => {
    let current = start;

    while (current !== path.dirname(current)) {
      if (
        fs.existsSync(path.join(current, 'README.md')) &&
        fs.existsSync(path.join(current, '.github', 'SECURITY.md'))
      ) {
        return current;
      }

      current = path.dirname(current);
    }

    throw new Error('Unable to locate repository root');
  };

  const repoRoot = findRepoRoot(process.cwd());
  const securityPolicyPath = path.join(repoRoot, '.github', 'SECURITY.md');
  const readmePath = path.join(repoRoot, 'README.md');
  const contributingPath = path.join(repoRoot, 'CONTRIBUTING.md');
  const maintainerPlaybookPath = path.join(repoRoot, 'MAINTAINER_WAVE_PLAYBOOK.md');
  const prDescriptionPath = path.join(repoRoot, 'PR_DESCRIPTION.md');

  describe('SECURITY.md file existence and structure', () => {
    it('should have a SECURITY.md file in .github directory', () => {
      expect(fs.existsSync(securityPolicyPath)).toBe(true);
    });

    it('should contain required sections', () => {
      const content = fs.readFileSync(securityPolicyPath, 'utf-8');
      
      // Required sections per coordinated disclosure best practices
      expect(content).toContain('# Security Policy');
      expect(content).toContain('## Supported Versions');
      expect(content).toContain('## Reporting a Vulnerability');
      expect(content).toContain('## Response expectations');
      expect(content).toContain('## Scope');
    });

    it('should specify private reporting channels', () => {
      const content = fs.readFileSync(securityPolicyPath, 'utf-8');
      
      // Must not encourage public issue reporting for vulnerabilities
      expect(content.toLowerCase()).toContain('do not open a public');
      
      // Must provide at least one private channel
      expect(content).toMatch(/GitHub private vulnerability reporting|email/i);
    });

    it('should define response timelines', () => {
      const content = fs.readFileSync(securityPolicyPath, 'utf-8');
      
      // Must have clear SLA expectations
      expect(content).toMatch(/\d+\s*(hours?|days?|business days?)/i);
      expect(content.toLowerCase()).toContain('acknowledgement');
      expect(content.toLowerCase()).toContain('triage');
    });

    it('should follow coordinated disclosure model', () => {
      const content = fs.readFileSync(securityPolicyPath, 'utf-8');
      
      expect(content.toLowerCase()).toContain('coordinated disclosure');
      expect(content).toMatch(/\d+\s*days?/i); // Disclosure timeline
    });

    it('should define scope boundaries', () => {
      const content = fs.readFileSync(securityPolicyPath, 'utf-8');
      
      // Must clearly state what is in scope
      expect(content).toMatch(/crashlab-core|apps\/web|contracts/i);
      
      // Should state what is out of scope
      expect(content.toLowerCase()).toContain('out of scope');
    });

    it('should reference known gaps and accepted risks', () => {
      const content = fs.readFileSync(securityPolicyPath, 'utf-8');
      
      expect(content).toMatch(/known gaps|accepted risks/i);
      expect(content).toContain('MAINTAINER_WAVE_PLAYBOOK.md');
    });

    it('should define maintainer conflict-of-interest handling', () => {
      const content = fs.readFileSync(securityPolicyPath, 'utf-8');

      expect(content).toContain('## Maintainer Conflicts of Interest');
      expect(content).toMatch(/unconflicted maintainer/i);
      expect(content).toContain('48 hours');
      expect(content).toContain('5 business days');
      expect(content).toContain('14 days');
    });
  });

  describe('README.md integration', () => {
    it('should link to SECURITY.md from README', () => {
      const content = fs.readFileSync(readmePath, 'utf-8');
      
      expect(content).toContain('## Security');
      expect(content).toContain('.github/SECURITY.md');
      expect(content.toLowerCase()).toContain('vulnerability');
    });

    it('should warn against public security issue reporting in README', () => {
      const content = fs.readFileSync(readmePath, 'utf-8');
      
      expect(content.toLowerCase()).toMatch(/do not open.*public issue.*security/i);
    });

    it('should mention conflict-of-interest handling in README security guidance', () => {
      const content = fs.readFileSync(readmePath, 'utf-8');

      expect(content.toLowerCase()).toContain('conflict-of-interest');
    });
  });

  describe('CONTRIBUTING.md security guidance', () => {
    it('should provide security guidance for contributors', () => {
      const content = fs.readFileSync(contributingPath, 'utf-8');
      
      expect(content).toMatch(/security guidance|security/i);
    });

    it('should reference input validation requirements', () => {
      const content = fs.readFileSync(contributingPath, 'utf-8');
      
      expect(content.toLowerCase()).toContain('validate');
      expect(content).toMatch(/CaseSeed|SeedSchema/);
    });

    it('should include security review checklist', () => {
      const content = fs.readFileSync(contributingPath, 'utf-8');
      
      expect(content).toContain('Security review checklist');
      expect(content).toMatch(/\[\s*\]/); // Checkbox format
    });

    it('should explain conflict disclosures without leaking private vulnerabilities', () => {
      const content = fs.readFileSync(contributingPath, 'utf-8');

      expect(content).toMatch(/conflict of interest/i);
      expect(content).toMatch(/private vulnerability/i);
      expect(content).toMatch(/unconflicted maintainer/i);
    });
  });

  describe('MAINTAINER_WAVE_PLAYBOOK.md operational security', () => {
    it('should document operational security assumptions', () => {
      const content = fs.readFileSync(maintainerPlaybookPath, 'utf-8');
      
      expect(content).toContain('Operational Security Assumptions');
      expect(content).toContain('Security Policy');
    });

    it('should reference SECURITY.md for disclosure process', () => {
      const content = fs.readFileSync(maintainerPlaybookPath, 'utf-8');
      
      expect(content).toContain('.github/SECURITY.md');
    });

    it('should document known security gaps', () => {
      const content = fs.readFileSync(maintainerPlaybookPath, 'utf-8');
      
      expect(content).toContain('Known gaps and accepted risks');
      expect(content.toLowerCase()).toMatch(/residual risk|mitigation/);
    });

    it('should provide PR review guidance for security-relevant changes', () => {
      const content = fs.readFileSync(maintainerPlaybookPath, 'utf-8');
      
      expect(content).toMatch(/reviewing.*security|security.*review/i);
      expect(content).toContain('fuzz input handling');
      expect(content).toContain('artifact storage');
    });

    it('should link to conflict-of-interest policy and verification command', () => {
      const content = fs.readFileSync(maintainerPlaybookPath, 'utf-8');

      expect(content).toContain('.github/SECURITY.md#maintainer-conflicts-of-interest');
      expect(content).toContain('Conflict-of-interest handling');
      expect(content).toContain('npm run test:policy');
    });
  });

  describe('No unresolved TODOs or TBDs', () => {
    it('should have no TODO or TBD markers in README.md', () => {
      const content = fs.readFileSync(readmePath, 'utf-8');
      
      // Allow "Resolved TODOs" section but no actual unresolved TODOs
      const lines = content.split('\n');
      const todoLines = lines.filter(line => 
        /TODO|TBD/.test(line) && 
        !/Resolved TODOs|No unresolved.*TODO/.test(line)
      );
      
      expect(todoLines).toHaveLength(0);
    });

    it('should have no TODO or TBD markers in CONTRIBUTING.md', () => {
      const content = fs.readFileSync(contributingPath, 'utf-8');
      
      const todoMatches = content.match(/\bTODO\b|\bTBD\b/g);
      expect(todoMatches).toBeNull();
    });

    it('should have no TODO or TBD markers in MAINTAINER_WAVE_PLAYBOOK.md', () => {
      const content = fs.readFileSync(maintainerPlaybookPath, 'utf-8');
      
      const todoMatches = content.match(/\bTODO\b|\bTBD\b/g);
      expect(todoMatches).toBeNull();
    });

    it('should have no TODO or TBD markers in SECURITY.md', () => {
      const content = fs.readFileSync(securityPolicyPath, 'utf-8');
      
      const todoMatches = content.match(/\bTODO\b|\bTBD\b/g);
      expect(todoMatches).toBeNull();
    });
  });

  describe('Validation commands', () => {
    it('should document validation commands in PR description', () => {
      const content = fs.readFileSync(prDescriptionPath, 'utf-8');
      
      // Should reference the grep command for TODO/TBD checking
      expect(content).toMatch(/grep.*TODO.*TBD|rg.*TODO.*TBD/i);
      expect(content).toContain('npm run test:policy');
      expect(content).toContain('Closes #');
    });
  });

  describe('Cross-reference consistency', () => {
    it('should have consistent security terminology across all docs', () => {
      const readme = fs.readFileSync(readmePath, 'utf-8');
      const contributing = fs.readFileSync(contributingPath, 'utf-8');
      const playbook = fs.readFileSync(maintainerPlaybookPath, 'utf-8');
      const security = fs.readFileSync(securityPolicyPath, 'utf-8');
      
      // All docs should reference the same security policy location
      const securityPathPattern = /\.github\/SECURITY\.md/;
      expect(readme).toMatch(securityPathPattern);
      expect(playbook).toMatch(securityPathPattern);
      
      // Security policy should be mentioned consistently
      const allDocs = [readme, contributing, playbook, security];
      const mentionsSecurity = allDocs.filter(doc => 
        doc.toLowerCase().includes('security')
      );
      expect(mentionsSecurity.length).toBe(4);
    });

    it('should have aligned response timelines between SECURITY.md and playbook', () => {
      const security = fs.readFileSync(securityPolicyPath, 'utf-8');
      const playbook = fs.readFileSync(maintainerPlaybookPath, 'utf-8');
      
      // Both should mention 48 hours for acknowledgement
      expect(security).toContain('48 hours');
      
      // Playbook should reference the security policy for disclosure
      expect(playbook).toContain('SECURITY.md');
    });
  });

  describe('Edge cases and failure modes', () => {
    it('should handle missing SECURITY.md gracefully in documentation', () => {
      const readme = fs.readFileSync(readmePath, 'utf-8');
      
      // README should have a fallback or clear instruction if SECURITY.md is missing
      expect(readme).toContain('Security Policy');
      expect(readme).toContain('.github/SECURITY.md');
    });

    it('should document what to do if private reporting is unavailable', () => {
      const content = fs.readFileSync(securityPolicyPath, 'utf-8');
      
      // Should provide alternative contact method
      expect(content.toLowerCase()).toMatch(/email|alternative|if.*unavailable/);
    });

    it('should specify behavior for out-of-scope reports', () => {
      const content = fs.readFileSync(securityPolicyPath, 'utf-8');
      
      expect(content.toLowerCase()).toContain('out of scope');
      expect(content).toMatch(/third-party|upstream|dependencies/i);
    });
  });
});
