/**
 * Onboarding progress store (issue #2266).
 * 
 * Tracks user/workspace onboarding checklist completion.
 * Storage: localStorage with per-user/workspace scoping
 */

import { safeStorage } from '../local-storage';

export type OnboardingRole = 'developer' | 'security' | 'maintainer' | 'operator';

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  completedAt?: Date;
}

export interface OnboardingProgress {
  role: OnboardingRole;
  items: ChecklistItem[];
  dismissed: boolean;
  snoozedUntil?: Date;
  completionRate: number;
}

const STORAGE_KEY = 'onboarding-progress';

class OnboardingProgressStore {
  save(userId: string, workspaceId: string, progress: OnboardingProgress): void {
    const key = `${STORAGE_KEY}:${userId}:${workspaceId}`;
    safeStorage.setJson(key, progress);
  }

  load(userId: string, workspaceId: string): OnboardingProgress | null {
    const key = `${STORAGE_KEY}:${userId}:${workspaceId}`;
    return safeStorage.getJson<OnboardingProgress>(key);
  }

  completeItem(userId: string, workspaceId: string, itemId: string): void {
    const progress = this.load(userId, workspaceId);
    if (!progress) return;

    const updatedItems = progress.items.map((item) =>
      item.id === itemId
        ? { ...item, completed: true, completedAt: new Date() }
        : item
    );

    const completionRate = 
      (updatedItems.filter((i) => i.completed).length / updatedItems.length) * 100;

    this.save(userId, workspaceId, {
      ...progress,
      items: updatedItems,
      completionRate,
    });
  }

  dismiss(userId: string, workspaceId: string): void {
    const progress = this.load(userId, workspaceId);
    if (!progress) return;

    this.save(userId, workspaceId, {
      ...progress,
      dismissed: true,
    });
  }

  snooze(userId: string, workspaceId: string, until: Date): void {
    const progress = this.load(userId, workspaceId);
    if (!progress) return;

    this.save(userId, workspaceId, {
      ...progress,
      snoozedUntil: until,
    });
  }

  reset(userId: string, workspaceId: string): void {
    const key = `${STORAGE_KEY}:${userId}:${workspaceId}`;
    safeStorage.removeItem(key);
  }
}

export const onboardingProgressStore = new OnboardingProgressStore();
