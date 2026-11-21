/**
 * Quarantine Manager
 * 
 * Manages quarantined artifacts with review workflow, approvals, and retention.
 */

import { writeFile, readFile, mkdir, readdir, rm, stat, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';

export type QuarantineStatus = 'pending' | 'under-review' | 'approved' | 'rejected' | 'released' | 'deleted';

export type QuarantineReason = 'malware' | 'suspicious' | 'unsigned' | 'invalid-signature' | 'policy-violation' | 'manual';

export interface QuarantineEntry {
  id: string;
  artifactId: string;
  artifactName: string;
  artifactType: string;
  artifactSize: number;
  artifactHash: string; // SHA256
  originalPath: string;
  quarantinePath: string;
  reason: QuarantineReason;
  status: QuarantineStatus;
  scanResults: ScanResultSummary[];
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  approvals: Approval[];
  requiredApprovals: number;
  releaseConditions: ReleaseCondition[];
  retentionUntil: string;
  metadata: Record<string, string>;
}

export interface ScanResultSummary {
  scanner: string;
  verdict: string;
  timestamp: string;
  matches: number;
  details: string;
}

export interface Approval {
  id: string;
  userId: string;
  userName: string;
  action: 'approve' | 'reject';
  timestamp: string;
  notes?: string;
}

export interface ReleaseCondition {
  type: 'approvals' | 'time' | 'manual' | 're-scan';
  value: string | number;
  met: boolean;
  metAt?: string;
}

export interface QuarantineFilter {
  status?: QuarantineStatus[];
  reason?: QuarantineReason[];
  artifactType?: string[];
  dateFrom?: string;
  dateTo?: string;
  reviewer?: string;
  limit?: number;
  offset?: number;
}

export interface QuarantineStats {
  total: number;
  pending: number;
  underReview: number;
  approved: number;
  rejected: number;
  released: number;
  deleted: number;
  byReason: Record<QuarantineReason, number>;
  oldestEntry?: string;
  newestEntry?: string;
}

export class QuarantineManager {
  private quarantineDir: string;
  private entries: Map<string, QuarantineEntry> = new Map();
  private initialized = false;

  constructor(quarantineDir: string = '/var/lib/crashlab/quarantine') {
    this.quarantineDir = quarantineDir;
  }

  /**
   * Initialize quarantine manager
   */
  async initialize(): Promise<void> {
    await mkdir(this.quarantineDir, { recursive: true });
    await mkdir(join(this.quarantineDir, 'artifacts'), { recursive: true });
    await mkdir(join(this.quarantineDir, 'metadata'), { recursive: true });
    await this.loadEntries();
    this.initialized = true;
  }

  /**
   * Load existing quarantine entries
   */
  private async loadEntries(): Promise<void> {
    try {
      const metaDir = join(this.quarantineDir, 'metadata');
      const files = await readdir(metaDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await readFile(join(metaDir, file), 'utf-8');
            const entry = JSON.parse(content) as QuarantineEntry;
            this.entries.set(entry.id, entry);
          } catch (error) {
            console.warn(`Failed to load quarantine entry ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load quarantine entries:', error);
    }
  }

  /**
   * Save entry to disk
   */
  private async saveEntry(entry: QuarantineEntry): Promise<void> {
    const metaDir = join(this.quarantineDir, 'metadata');
    await mkdir(metaDir, { recursive: true });
    await writeFile(join(metaDir, `${entry.id}.json`), JSON.stringify(entry, null, 2));
  }

  /**
   * Quarantine an artifact
   */
  async quarantineArtifact(
    artifactId: string,
    artifactName: string,
    artifactType: string,
    artifactBuffer: Buffer,
    originalPath: string,
    reason: QuarantineReason,
    scanResults: ScanResultSummary[],
    requiredApprovals: number = 2,
    retentionDays: number = 90
  ): Promise<QuarantineEntry> {
    if (!this.initialized) await this.initialize();

    const crypto = require('node:crypto');
    const artifactHash = crypto.createHash('sha256').update(artifactBuffer).digest('hex');
    
    const quarantineId = uuidv4();
    const quarantinePath = join(this.quarantineDir, 'artifacts', `${quarantineId}${this.getExtension(artifactName)}`);
    
    // Save artifact to quarantine
    await writeFile(quarantinePath, artifactBuffer);

    const now = new Date().toISOString();
    const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const entry: QuarantineEntry = {
      id: quarantineId,
      artifactId,
      artifactName,
      artifactType,
      artifactSize: artifactBuffer.length,
      artifactHash,
      originalPath,
      quarantinePath,
      reason,
      status: 'pending',
      scanResults,
      createdAt: now,
      updatedAt: now,
      approvals: [],
      requiredApprovals,
      releaseConditions: [
        { type: 'approvals', value: requiredApprovals, met: false },
        { type: 'time', value: retentionDays, met: false },
      ],
      retentionUntil,
      metadata: {},
    };

    this.entries.set(quarantineId, entry);
    await this.saveEntry(entry);

    return entry;
  }

  /**
   * Get quarantine entry
   */
  getEntry(id: string): QuarantineEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Get all entries with filtering
   */
  getEntries(filter: QuarantineFilter = {}): QuarantineEntry[] {
    let entries = Array.from(this.entries.values());

    if (filter.status && filter.status.length > 0) {
      entries = entries.filter(e => filter.status!.includes(e.status));
    }

    if (filter.reason && filter.reason.length > 0) {
      entries = entries.filter(e => filter.reason!.includes(e.reason));
    }

    if (filter.artifactType && filter.artifactType.length > 0) {
      entries = entries.filter(e => filter.artifactType!.includes(e.artifactType));
    }

    if (filter.dateFrom) {
      entries = entries.filter(e => e.createdAt >= filter.dateFrom!);
    }

    if (filter.dateTo) {
      entries = entries.filter(e => e.createdAt <= filter.dateTo!);
    }

    if (filter.reviewer) {
      entries = entries.filter(e => e.reviewedBy === filter.reviewer);
    }

    // Sort by createdAt descending
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (filter.offset) {
      entries = entries.slice(filter.offset);
    }

    if (filter.limit) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  /**
   * Get quarantine statistics
   */
  getStats(): QuarantineStats {
    const entries = Array.from(this.entries.values());
    
    const byReason: Record<QuarantineReason, number> = {
      malware: 0,
      suspicious: 0,
      unsigned: 0,
      'invalid-signature': 0,
      'policy-violation': 0,
      manual: 0,
    };

    for (const entry of entries) {
      byReason[entry.reason]++;
    }

    const sortedByDate = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      total: entries.length,
      pending: entries.filter(e => e.status === 'pending').length,
      underReview: entries.filter(e => e.status === 'under-review').length,
      approved: entries.filter(e => e.status === 'approved').length,
      rejected: entries.filter(e => e.status === 'rejected').length,
      released: entries.filter(e => e.status === 'released').length,
      deleted: entries.filter(e => e.status === 'deleted').length,
      byReason,
      oldestEntry: sortedByDate[0]?.createdAt,
      newestEntry: sortedByDate[sortedByDate.length - 1]?.createdAt,
    };
  }

  /**
   * Start review of an entry
   */
  async startReview(entryId: string, reviewerId: string, reviewerName: string): Promise<QuarantineEntry | null> {
    const entry = this.entries.get(entryId);
    if (!entry) return null;

    if (entry.status !== 'pending') {
      throw new Error(`Entry is not in pending status: ${entry.status}`);
    }

    entry.status = 'under-review';
    entry.reviewedBy = reviewerId;
    entry.updatedAt = new Date().toISOString();

    this.entries.set(entryId, entry);
    await this.saveEntry(entry);

    return entry;
  }

  /**
   * Add approval/rejection
   */
  async addApproval(
    entryId: string,
    userId: string,
    userName: string,
    action: 'approve' | 'reject',
    notes?: string
  ): Promise<QuarantineEntry | null> {
    const entry = this.entries.get(entryId);
    if (!entry) return null;

    if (entry.status === 'released' || entry.status === 'deleted') {
      throw new Error(`Entry is already ${entry.status}`);
    }

    // Check if user already voted
    const existingApproval = entry.approvals.find(a => a.userId === userId);
    if (existingApproval) {
      throw new Error('User has already voted on this entry');
    }

    const approval: Approval = {
      id: uuidv4(),
      userId,
      userName,
      action,
      timestamp: new Date().toISOString(),
      notes,
    };

    entry.approvals.push(approval);
    entry.updatedAt = new Date().toISOString();

    // Check if rejected
    if (action === 'reject') {
      entry.status = 'rejected';
      entry.reviewNotes = notes || 'Rejected by reviewer';
    } else {
      // Check if enough approvals
      const approvalCount = entry.approvals.filter(a => a.action === 'approve').length;
      if (approvalCount >= entry.requiredApprovals) {
        entry.status = 'approved';
        entry.releaseConditions.find(c => c.type === 'approvals')!.met = true;
        entry.releaseConditions.find(c => c.type === 'approvals')!.metAt = new Date().toISOString();
      }
    }

    this.entries.set(entryId, entry);
    await this.saveEntry(entry);

    return entry;
  }

  /**
   * Release an approved entry back to original location
   */
  async releaseEntry(entryId: string, releasePath?: string): Promise<{ success: boolean; path?: string; error?: string }> {
    const entry = this.entries.get(entryId);
    if (!entry) return { success: false, error: 'Entry not found' };

    if (entry.status !== 'approved') {
      return { success: false, error: `Entry must be approved to release, current status: ${entry.status}` };
    }

    try {
      const targetPath = releasePath || entry.originalPath;
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(entry.quarantinePath, targetPath);

      entry.status = 'released';
      entry.updatedAt = new Date().toISOString();
      entry.releaseConditions.find(c => c.type === 'manual')!.met = true;
      entry.releaseConditions.find(c => c.type === 'manual')!.metAt = new Date().toISOString();

      this.entries.set(entryId, entry);
      await this.saveEntry(entry);

      return { success: true, path: targetPath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Release failed' };
    }
  }

  /**
   * Delete a quarantined entry
   */
  async deleteEntry(entryId: string, deleteArtifact: boolean = true): Promise<boolean> {
    const entry = this.entries.get(entryId);
    if (!entry) return false;

    try {
      if (deleteArtifact) {
        await rm(entry.quarantinePath, { force: true });
      }
      
      const metaPath = join(this.quarantineDir, 'metadata', `${entryId}.json`);
      await rm(metaPath, { force: true });

      entry.status = 'deleted';
      entry.updatedAt = new Date().toISOString();
      
      this.entries.delete(entryId);
      return true;
    } catch (error) {
      console.error('Failed to delete quarantine entry:', error);
      return false;
    }
  }

  /**
   * Download quarantined artifact (for safe inspection)
   */
  async getArtifactBuffer(entryId: string): Promise<Buffer | null> {
    const entry = this.entries.get(entryId);
    if (!entry) return null;

    try {
      return await readFile(entry.quarantinePath);
    } catch {
      return null;
    }
  }

  /**
   * Get artifact as base64 (for safe web viewing)
   */
  async getArtifactBase64(entryId: string): Promise<string | null> {
    const buffer = await this.getArtifactBuffer(entryId);
    return buffer?.toString('base64') || null;
  }

  /**
   * Run retention cleanup
   */
  async runRetentionCleanup(): Promise<{ deleted: number; errors: number }> {
    let deleted = 0;
    let errors = 0;
    const now = new Date();

    for (const entry of this.entries.values()) {
      if (entry.status === 'deleted') continue;
      
      const retentionDate = new Date(entry.retentionUntil);
      if (now > retentionDate) {
        const success = await this.deleteEntry(entry.id, true);
        if (success) deleted++;
        else errors++;
      }
    }

    return { deleted, errors };
  }

  /**
   * Re-scan a quarantined artifact
   */
  async rescanEntry(entryId: string, scanResults: ScanResultSummary[]): Promise<QuarantineEntry | null> {
    const entry = this.entries.get(entryId);
    if (!entry) return null;

    entry.scanResults = scanResults;
    entry.updatedAt = new Date().toISOString();
    entry.releaseConditions.find(c => c.type === 're-scan')!.met = true;
    entry.releaseConditions.find(c => c.type === 're-scan')!.metAt = new Date().toISOString();

    // If scan is now clean, can consider for release
    const allClean = scanResults.every(r => r.verdict === 'clean');
    if (allClean && entry.status === 'pending') {
      entry.status = 'pending'; // Keep pending for manual review
    }

    this.entries.set(entryId, entry);
    await this.saveEntry(entry);

    return entry;
  }

  /**
   * Update entry metadata
   */
  async updateMetadata(entryId: string, metadata: Record<string, string>): Promise<QuarantineEntry | null> {
    const entry = this.entries.get(entryId);
    if (!entry) return null;

    entry.metadata = { ...entry.metadata, ...metadata };
    entry.updatedAt = new Date().toISOString();

    this.entries.set(entryId, entry);
    await this.saveEntry(entry);

    return entry;
  }

  /**
   * Get file extension from name
   */
  private getExtension(name: string): string {
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.substring(idx) : '';
  }

  /**
   * Export quarantine data
   */
  async exportQuarantineData(outputPath: string): Promise<void> {
    const entries = Array.from(this.entries.values());
    await writeFile(outputPath, JSON.stringify({
      exportedAt: new Date().toISOString(),
      entries,
    }, null, 2));
  }
}

/**
 * Create a quarantine manager with default path
 */
export function createQuarantineManager(quarantineDir?: string): QuarantineManager {
  return new QuarantineManager(
    quarantineDir || process.env.CRASHLAB_QUARANTINE_DIR || '/var/lib/crashlab/quarantine'
  );
}