import { NextResponse } from 'next/server';
import { z } from 'zod';
import { describePrincipal } from '@/lib/rbac';
import { createSecret } from '@/lib/security/secrets/server';

const CreateSecretSchema = z.object({
  integrationId: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  value: z.string().min(1).max(16_384),
});

export async function GET(request: Request) {
  const { principal, role } = await describePrincipal(request as never);
  if (!principal.authenticated || role !== 'maintainer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = await resolveTenantId(principal);
  return NextResponse.json({ data: await listSecretMetadata(tenantId) });
}

export async function POST(request: Request) {
  const { principal, role } = await describePrincipal(request as never);
  if (!principal.authenticated || role !== 'maintainer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = CreateSecretSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const tenantId = await resolveTenantId(principal);
  const metadata = await createSecret({ tenantId, ...parsed.data });

  // Never echo the submitted value or include it in logs/errors.
  return NextResponse.json({ data: metadata }, { status: 201 });
}
