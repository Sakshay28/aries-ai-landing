import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { VARIABLE_REGISTRY, validateTemplate } from '@/lib/automations/variables';
import { tenantSampleData } from '@/lib/automations/preview';

// GET — returns the variable registry + tenant-specific sample data
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    variables: VARIABLE_REGISTRY,
    sampleData: await tenantSampleData(tenantId),
  });
}

// POST — validates a template and returns a live preview rendered with the
// tenant's own sample data
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { template } = await req.json();
  if (typeof template !== 'string') {
    return NextResponse.json({ error: 'template is required' }, { status: 400 });
  }

  const validation = validateTemplate(template);
  const sample = await tenantSampleData(tenantId);

  const preview = template.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) =>
    sample[key] ?? `{{${key}}}`,
  );

  return NextResponse.json({
    valid: validation.valid,
    unknownVariables: validation.unknownVariables,
    suggestions: validation.suggestions,
    preview,
  });
}
