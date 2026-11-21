/**
 * Onboarding progress API (issue #2266 Phase 1).
 * 
 * GET /api/onboarding/progress - Get progress for current user/workspace
 * POST /api/onboarding/progress - Update progress
 */

import { NextRequest, NextResponse } from 'next/server';
import { onboardingProgressStore } from '@/lib/storage/onboarding-progress-store';

// Mock user/workspace for demonstration
const MOCK_USER_ID = 'user_1';
const MOCK_WORKSPACE_ID = 'workspace_1';

export async function GET() {
  try {
    const progress = onboardingProgressStore.load(MOCK_USER_ID, MOCK_WORKSPACE_ID);
    
    if (!progress) {
      return NextResponse.json({ progress: null });
    }
    
    return NextResponse.json({ progress });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load progress' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, itemId, until } = body;

    switch (action) {
      case 'complete':
        if (!itemId) {
          return NextResponse.json(
            { error: 'itemId is required' },
            { status: 400 }
          );
        }
        onboardingProgressStore.completeItem(MOCK_USER_ID, MOCK_WORKSPACE_ID, itemId);
        break;
        
      case 'dismiss':
        onboardingProgressStore.dismiss(MOCK_USER_ID, MOCK_WORKSPACE_ID);
        break;
        
      case 'snooze':
        if (!until) {
          return NextResponse.json(
            { error: 'until is required' },
            { status: 400 }
          );
        }
        onboardingProgressStore.snooze(MOCK_USER_ID, MOCK_WORKSPACE_ID, new Date(until));
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    const progress = onboardingProgressStore.load(MOCK_USER_ID, MOCK_WORKSPACE_ID);
    return NextResponse.json({ progress });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update progress' },
      { status: 500 }
    );
  }
}
