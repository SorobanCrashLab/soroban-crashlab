/**
 * Export jobs store for async export/report generation (issue #2264).
 * 
 * Job state machine: queued → running → completed | failed (with retry)
 * Storage: In-memory with hooks for future DB integration
 */

export type ExportFormat = 'csv' | 'json' | 'jsonl' | 'pdf';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ExportJob {
  id: string;
  status: JobStatus;
  format: ExportFormat;
  entity: string; // 'runs' | 'crashes' | 'campaigns' | 'metrics'
  filters: Record<string, unknown>;
  columns?: string[];
  totalRows?: number;
  processedRows?: number;
  progress?: number; // 0-100
  downloadUrl?: string;
  expiresAt?: Date;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
}

class ExportJobsStore {
  private jobs: Map<string, ExportJob> = new Map();
  private listeners: Set<(jobs: ExportJob[]) => void> = new Set();

  create(job: Omit<ExportJob, 'id' | 'status' | 'createdAt' | 'retryCount'>): ExportJob {
    const newJob: ExportJob = {
      ...job,
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'queued',
      createdAt: new Date(),
      retryCount: 0,
    };
    
    this.jobs.set(newJob.id, newJob);
    this.notify();
    return newJob;
  }

  get(id: string): ExportJob | undefined {
    return this.jobs.get(id);
  }

  list(): ExportJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  updateStatus(id: string, status: JobStatus, updates?: Partial<ExportJob>): void {
    const job = this.jobs.get(id);
    if (!job) return;

    this.jobs.set(id, {
      ...job,
      status,
      ...updates,
      ...(status === 'running' && !job.startedAt ? { startedAt: new Date() } : {}),
      ...(status === 'completed' || status === 'failed' ? { completedAt: new Date() } : {}),
    });
    
    this.notify();
  }

  updateProgress(id: string, processedRows: number, totalRows: number): void {
    const job = this.jobs.get(id);
    if (!job) return;

    const progress = Math.round((processedRows / totalRows) * 100);
    
    this.jobs.set(id, {
      ...job,
      processedRows,
      totalRows,
      progress,
    });
    
    this.notify();
  }

  retry(id: string): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'failed') return;

    this.jobs.set(id, {
      ...job,
      status: 'queued',
      error: undefined,
      retryCount: job.retryCount + 1,
    });
    
    this.notify();
  }

  delete(id: string): void {
    this.jobs.delete(id);
    this.notify();
  }

  subscribe(listener: (jobs: ExportJob[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const jobs = this.list();
    this.listeners.forEach((listener) => listener(jobs));
  }
}

export const exportJobsStore = new ExportJobsStore();
