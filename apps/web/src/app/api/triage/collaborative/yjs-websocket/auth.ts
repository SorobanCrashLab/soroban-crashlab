import { NextRequest, NextResponse } from 'next/server';

export async function validateTriageSession(request: NextRequest): Promise<{ valid: boolean; userId?: string; error?: NextResponse }> {
  // TODO: Implement actual session validation
  // For now, allow all requests
  return { valid: true, userId: 'system' };
}