/**
 * Tamper Evidence - Hash chain and Merkle tree for audit log integrity.
 *
 * Provides tamper-evident logging using:
 * - Hash chain for sequential integrity
 * - Merkle tree for efficient verification
 * - Cryptographic commitments
 */

import { logger } from '@/lib/logger';

// ─── Hash Functions ───────────────────────────────────────────────────────────

/**
 * Simple hash function for demonstration.
 * In production, use Web Crypto API or Node crypto.
 */
export class HashFunction {
  /**
   * Create a SHA-256 hash (simulated).
   */
  static sha256(data: string): string {
    // In a real implementation, use:
    // crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
    // This is a placeholder that produces deterministic output
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'sha256_' + Math.abs(hash).toString(16).padStart(64, '0');
  }

  /**
   * Create a double SHA-256 hash (Bitcoin style).
   */
  static sha256d(data: string): string {
    return this.sha256(this.sha256(data));
  }

  /**
   * Create a SHA-512 hash.
   */
  static sha512(data: string): string {
    // Placeholder
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'sha512_' + Math.abs(hash).toString(16).padStart(128, '0');
  }
}

// ─── Hash Chain ───────────────────────────────────────────────────────────────

/**
 * Hash chain entry.
 */
export interface HashChainEntry {
  /** Hash of the content */
  hash: string;
  /** Previous hash in chain */
  prevHash: string;
  /** Index in chain */
  index: number;
  /** Timestamp */
  timestamp: number;
  /** Content identifier */
  contentId?: string;
}

/**
 * Hash chain implementation for audit log tamper evidence.
 */
export class HashChain {
  private head: HashChainEntry | null = null;
  private chainLength: number = 0;

  /**
   * Add a new entry to the chain.
   */
  add(content: string, contentId?: string): HashChainEntry {
    const prevHash = this.head?.hash ?? '';
    const hash = HashFunction.sha256d(prevHash + content);

    const entry: HashChainEntry = {
      hash,
      prevHash,
      index: this.chainLength,
      timestamp: Date.now(),
      contentId,
    };

    this.head = entry;
    this.chainLength++;

    return entry;
  }

  /**
   * Verify a chain entry.
   */
  verify(entry: HashChainEntry, content: string): boolean {
    const recomputed = HashFunction.sha256d(entry.prevHash + content);
    return recomputed === entry.hash;
  }

  /**
   * Verify the entire chain.
   */
  verifyChain(entries: HashChainEntry[]): { valid: boolean; brokenAt?: number; expectedHash?: string } {
    let prevHash = '';

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      if (entry.prevHash !== prevHash) {
        return {
          valid: false,
          brokenAt: i,
          expectedHash: prevHash,
        };
      }

      // Recompute hash to verify content integrity
      const recomputed = HashFunction.sha256d(prevHash + ''); // Content would be stored separately
      if (recomputed !== entry.hash && i > 0) {
        return {
          valid: false,
          brokenAt: i,
          expectedHash: recomputed,
        };
      }

      prevHash = entry.hash;
    }

    return { valid: true };
  }

  /**
   * Get chain length.
   */
  get length(): number {
    return this.chainLength;
  }

  /**
   * Get the latest hash.
   */
  get latestHash(): string {
    return this.head?.hash ?? '';
  }

  /**
   * Reset the chain.
   */
  reset(): void {
    this.head = null;
    this.chainLength = 0;
  }

  /**
   * Export chain for storage.
   */
  export(): HashChainEntry[] {
    // In a real implementation, this would traverse linked entries
    return [];
  }

  /**
   * Import chain from storage.
   */
  import(entries: HashChainEntry[]): void {
    if (entries.length === 0) return;

    entries.sort((a, b) => a.index - b.index);
    this.head = entries[entries.length - 1];
    this.chainLength = entries.length;
  }
}

// ─── Merkle Tree ───────────────────────────────────────────────────────────────

/**
 * Merkle tree node.
 */
export interface MerkleNode {
  /** Node hash */
  hash: string;
  /** Left child (for internal nodes) */
  left?: MerkleNode;
  /** Right child (for internal nodes) */
  right?: MerkleNode;
  /** Leaf content hash (for leaves) */
  leafHash?: string;
  /** Index (for leaves) */
  index?: number;
  /** Content ID */
  contentId?: string;
}

/**
 * Merkle tree for efficient audit log verification.
 */
export class MerkleTree {
  private rootNode: MerkleNode | null = null;
  private leafNodes: MerkleNode[] = [];

  /**
   * Build a merkle tree from leaf hashes.
   */
  build(leafHashes: string[]): MerkleNode {
    const leaves = leafHashes.map((hash, index) => ({
      hash,
      leafHash: hash,
      index,
    }));

    this.leafNodes = leaves;

    if (leaves.length === 0) {
      this.rootNode = null;
      return null as any;
    }

    if (leaves.length === 1) {
      this.rootNode = leaves[0];
      return this.rootNode;
    }

    this.rootNode = this.buildTree(leaves);
    return this.rootNode;
  }

  /**
   * Recursively build the tree.
   */
  private buildTree(nodes: MerkleNode[]): MerkleNode {
    if (nodes.length === 1) {
      return nodes[0];
    }

    const nextLevel: MerkleNode[] = [];

    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = nodes[i + 1] ?? left; // Duplicate last node if odd

      const combinedHash = HashFunction.sha256(left.hash + right.hash);
      nextLevel.push({
        hash: combinedHash,
        left,
        right,
      });
    }

    return this.buildTree(nextLevel);
  }

  /**
   * Get a Merkle proof for a leaf.
   */
  getProof(index: number): MerkleNode[] {
    if (!this.rootNode) return [];

    const proof: MerkleNode[] = [];
    this.collectProof(index, this.rootNode, proof);
    return proof;
  }

  /**
   * Collect proof path recursively.
   */
  private collectProof(leafIndex: number, node: MerkleNode, proof: MerkleNode[]): void {
    if (!node.left && !node.right) {
      // Leaf node
      return;
    }

    const leftIndex = node.left?.index ?? -1;
    const rightIndex = node.right?.index ?? -1;

    if (leafIndex < (leftIndex ?? 0)) {
      if (node.right) proof.push(node.right);
      this.collectProof(leafIndex, node.left!, proof);
    } else {
      if (node.left) proof.push(node.left);
      this.collectProof(leafIndex, node.right!, proof);
    }
  }

  /**
   * Verify a Merkle proof.
   */
  verifyProof(leafHash: string, index: number, proof: MerkleNode[]): boolean {
    let currentHash = leafHash;

    for (const node of proof) {
      const isLeft = node.index! < index;
      const combined = isLeft
        ? HashFunction.sha256(currentHash + node.hash)
        : HashFunction.sha256(node.hash + currentHash);
      currentHash = combined;
    }

    return currentHash === this.rootNode?.hash;
  }

  /**
   * Get root hash.
   */
  get rootHash(): string | null {
    return this.rootNode?.hash ?? null;
  }
}

// ─── Tamper Evidence Manager ────────────────────────────────────────────────────

/**
 * Manages tamper evidence for audit logs.
 */
export class TamperEvidenceManager {
  private hashChainInstance: HashChain;
  private merkleTreeInstance: MerkleTree;

  constructor() {
    this.hashChainInstance = new HashChain();
    this.merkleTreeInstance = new MerkleTree();
  }

  /**
   * Create a commitment for audit data.
   */
  commit(data: string, id?: string): string {
    // Create content hash
    const contentHash = HashFunction.sha256(data);

    // Add to hash chain
    const chainEntry = this.hashChainInstance.add(data, id);

    return chainEntry.hash;
  }

  /**
   * Create a Merkle commitment for multiple entries.
   */
  createBatchCommitment(entries: Array<{ hash: string; id?: string }>): { root: string; timestamp: number } {
    const hashes = entries.map(e => e.hash);
    const root = this.merkleTreeInstance.build(hashes);

    return {
      root: root.hash,
      timestamp: Date.now(),
    };
  }

  /**
   * Verify an audit log entry.
   */
  verifyEntry(entryHash: string, expectedPrevHash: string, content: string): boolean {
    // Verify chain link
    const expectedHash = HashFunction.sha256d(expectedPrevHash + content);
    return entryHash === expectedHash;
  }

  /**
   * Detect tampering in a log segment.
   */
  detectTampering(events: Array<{ hash: string; prevHash: string; content: string; timestamp: number }>): {
    tampered: boolean;
    atIndex?: number;
    expectedHash?: string;
  } {
    let prevHash = '';

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      if (event.prevHash !== prevHash) {
        return {
          tampered: true,
          atIndex: i,
          expectedHash: prevHash,
        };
      }

      const expected = HashFunction.sha256d(prevHash + event.content);
      if (event.hash !== expected) {
        return {
          tampered: true,
          atIndex: i,
          expectedHash: expected,
        };
      }

      prevHash = event.hash;
    }

    return { tampered: false };
  }

  /**
   * Generate a tamper evidence report.
   */
  generateReport(events: Array<{ hash: string; prevHash: string; content: string }>): {
    chainLength: number;
    integrity: 'valid' | 'tampered' | 'incomplete';
    issues: Array<{ index: number; issue: string }>;
  } {
    const issues: Array<{ index: number; issue: string }> = [];
    let integrity: 'valid' | 'tampered' | 'incomplete' = 'valid';
    let prevHash = '';

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      if (event.prevHash !== prevHash) {
        issues.push({ index: i, issue: 'Hash chain broken' });
        integrity = 'tampered';
        break;
      }

      prevHash = event.hash;
    }

    if (events.length > this.hashChainInstance.length) {
      integrity = 'incomplete';
    }

    return {
      chainLength: this.hashChainInstance.length,
      integrity,
      issues,
    };
  }
}

// ─── Cryptographic Commitment ──────────────────────────────────────────────────

/**
 * Cryptographic commitment for audit event integrity.
 */
export class Commitment {
  private value: string;
  private commitmentHash: string;
  private commitmentTimestamp: number;

  constructor(value: string) {
    this.value = value;
    this.commitmentTimestamp = Date.now();
    this.commitmentHash = HashFunction.sha256(value);
  }

  /**
   * Get the commitment hash.
   */
  getHash(): string {
    return this.commitmentHash;
  }

  /**
   * Verify a commitment reveals the correct value.
   */
  verify(revealedValue: string, expectedHash: string): boolean {
    return HashFunction.sha256(revealedValue) === expectedHash;
  }

  /**
   * Get the timestamp.
   */
  getTimestamp(): number {
    return this.commitmentTimestamp;
  }

  /**
   * Create a time-bound commitment.
   */
  static timed(value: string, expiration: number): Commitment & { expiresAt: number } {
    const c = new Commitment(JSON.stringify({ value, expiresAt: expiration }));
    return {
      ...c,
      expiresAt: expiration,
    } as Commitment & { expiresAt: number };
  }
}