import { NextRequest, NextResponse } from 'next/server';
import { checkRbacPermission } from '../../../../lib/rbac';
import { checkRequestSize } from '../../../../lib/request-size-limits';
import {
  setNotificationPreference,
  getNotificationPreference,
  DigestFrequency,
} from '../../../../lib/storage/notification-store';

export async function GET(request: NextRequest) {
  const rbacError = await checkRbacPermission(request);
  if (rbacError) return rbacError;

  const userId = 'current-user';
  const preference = getNotificationPreference(userId) || {
    id: '',
    userId,
    emailDigestFrequency: 'immediate' as DigestFrequency,
    enabledEventTypes: ['run_failure'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json({ preference });
}

export async function POST(request: NextRequest) {
  const rbacError = await checkRbacPermission(request);
  if (rbacError) return rbacError;

  const sizeError = checkRequestSize(request);
  if (sizeError) return sizeError;

  try {
    const body = await request.json() as {
      emailDigestFrequency?: DigestFrequency;
      enabledEventTypes?: string[];
    };

    const userId = 'current-user';

    const preference = setNotificationPreference(userId, {
      emailDigestFrequency: body.emailDigestFrequency,
      enabledEventTypes: body.enabledEventTypes as any,
    });

    return NextResponse.json({ preference }, { status: 201 });
  } catch (error) {
    console.error('Failed to update notification preference:', error);
    return NextResponse.json(
      { error: 'Failed to update notification preference' },
      { status: 500 }
    );
  }
}
