// ═══════════════════════════════════════════════════════════
// 🔐 Tenant Guard — Cross-Tenant API Access Prevention
// ═══════════════════════════════════════════════════════════
// Usage in every API route handler:
//
//   const guard = await withTenantGuard(req);
//   if (guard.error) return guard.error;   // 401 or 403
//   const { tenantId } = guard;
//
// If the request body/params contain a tenant_id field that
// doesn't match the authenticated tenant, returns 403 immediately.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';

interface GuardSuccess {
  tenantId: string;
  error: null;
}
interface GuardFailure {
  tenantId: null;
  error: NextResponse;
}

export async function withTenantGuard(
  req: NextRequest,
  claimedTenantId?: string   // optional: tenant_id from URL params / body
): Promise<GuardSuccess | GuardFailure> {
  const tenantId = await getTenantId();

  if (!tenantId) {
    return {
      tenantId: null,
      error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    };
  }

  // If the caller is trying to access a different tenant's data — block it
  if (claimedTenantId && claimedTenantId !== tenantId) {
    console.warn(
      `🚨 Cross-tenant access attempt: authenticated tenant=${tenantId} tried to access tenant=${claimedTenantId}`
    );
    return {
      tenantId: null,
      error: NextResponse.json(
        { success: false, error: 'Forbidden: tenant mismatch' },
        { status: 403 }
      ),
    };
  }

  return { tenantId, error: null };
}

// ─── Assert tenant ownership on a DB row ─────────────────────
// Use after fetching a record to verify the row belongs to this tenant.
export function assertTenantOwnership(
  rowTenantId: string,
  authenticatedTenantId: string,
  resourceName = 'resource'
): NextResponse | null {
  if (rowTenantId !== authenticatedTenantId) {
    console.warn(
      `🚨 Tenant ownership violation: ${resourceName} belongs to ${rowTenantId}, accessed by ${authenticatedTenantId}`
    );
    return NextResponse.json(
      { success: false, error: `Forbidden: you do not own this ${resourceName}` },
      { status: 403 }
    );
  }
  return null;
}
