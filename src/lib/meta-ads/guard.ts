import { NextResponse } from 'next/server';
import { getCurrentUser, type Role, type CurrentUser } from '@/lib/auth/getCurrentUser';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptAccessToken } from './oauth';
import type { MetaConnection } from './types';

// RBAC: who can do what with Meta Ads.
// Spec roles → app roles: Owner=owner, Admin=admin, Marketing Manager=manager, Viewer=viewer/staff
const WRITE_ROLES: Role[] = ['owner', 'admin', 'manager'];
const CONNECT_ROLES: Role[] = ['owner', 'admin'];

export interface GuardSuccess {
  ok: true;
  user: CurrentUser;
  tenantId: string;
}
export interface GuardFailure {
  ok: false;
  response: NextResponse;
}
export type GuardResult = GuardSuccess | GuardFailure;

/** Require an authenticated user. Returns tenantId + user, or a 401 response. */
export async function requireUser(): Promise<GuardResult> {
  const user = await getCurrentUser();
  if (!user || !user.tenant_id) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true, user, tenantId: user.tenant_id };
}

/** Require write permission (create/edit/pause campaigns). */
export async function requireWrite(): Promise<GuardResult> {
  const res = await requireUser();
  if (!res.ok) return res;
  if (!WRITE_ROLES.includes(res.user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden — your role cannot modify campaigns' },
        { status: 403 }
      ),
    };
  }
  return res;
}

/** Require connect permission (manage the Meta OAuth connection). */
export async function requireConnect(): Promise<GuardResult> {
  const res = await requireUser();
  if (!res.ok) return res;
  if (!CONNECT_ROLES.includes(res.user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden — only owners and admins can manage the Meta connection' },
        { status: 403 }
      ),
    };
  }
  return res;
}

/** Load the tenant's Meta connection row (admin client, manual tenant filter). */
export async function getConnection(tenantId: string): Promise<MetaConnection | null> {
  const { data } = await supabaseAdmin
    .from('meta_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return (data as MetaConnection | null) ?? null;
}

/** Load the connection and return its decrypted token, or throw a typed error. */
export async function getConnectionToken(tenantId: string): Promise<{
  connection: MetaConnection;
  token: string;
}> {
  const connection = await getConnection(tenantId);
  if (!connection) {
    throw new MetaConnectionError('not_connected', 'No Meta connection found. Please connect your account.');
  }
  if (connection.status === 'needs_reauth' || connection.status === 'disconnected') {
    throw new MetaConnectionError('needs_reauth', 'Meta connection needs reauthorization.');
  }
  const token = decryptAccessToken(connection.access_token);
  return { connection, token };
}

export class MetaConnectionError extends Error {
  constructor(public code: 'not_connected' | 'needs_reauth' | 'error', message: string) {
    super(message);
    this.name = 'MetaConnectionError';
  }
}

/** Convert a thrown error into a clean JSON response. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof MetaConnectionError) {
    const status = err.code === 'not_connected' ? 404 : 409;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('Meta Ads API error:', message);
  return NextResponse.json({ error: message }, { status: 500 });
}
