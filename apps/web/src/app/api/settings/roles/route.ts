import { NextRequest, NextResponse } from 'next/server';
import { checkRbacPermission } from '../../../../lib/rbac';
import { checkRequestSize } from '../../../../lib/request-size-limits';
import { assignRole, revokeRole, listRoleAssignments } from '../../../../lib/storage/role-store';

export async function GET(request: NextRequest) {
  const rbacError = checkRbacPermission(request);
  if (rbacError) return rbacError;

  const assignments = listRoleAssignments();

  return NextResponse.json({
    assignments,
  });
}

export async function POST(request: NextRequest) {
  const rbacError = checkRbacPermission(request);
  if (rbacError) return rbacError;

  const sizeError = checkRequestSize(request);
  if (sizeError) return sizeError;

  try {
    const body = await request.json() as {
      identityType: 'github' | 'api-key';
      identityValue: string;
      role: 'analyst' | 'maintainer';
    };

    if (!body.identityType || !body.identityValue || !body.role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const assignment = assignRole({
      identityType: body.identityType,
      identityValue: body.identityValue,
      role: body.role,
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    console.error('Failed to assign role:', error);
    return NextResponse.json(
      { error: 'Failed to assign role' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const rbacError = checkRbacPermission(request);
  if (rbacError) return rbacError;

  const sizeError = checkRequestSize(request);
  if (sizeError) return sizeError;

  try {
    const body = await request.json() as {
      identityType: 'github' | 'api-key';
      identityValue: string;
    };

    if (!body.identityType || !body.identityValue) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const success = revokeRole({
      identityType: body.identityType,
      identityValue: body.identityValue,
    });

    if (!success) {
      return NextResponse.json(
        { error: 'Role assignment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to revoke role:', error);
    return NextResponse.json(
      { error: 'Failed to revoke role' },
      { status: 500 }
    );
  }
}
