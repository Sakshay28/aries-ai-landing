import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import {
  VARIABLE_REGISTRY,
  SAMPLE_VARIABLES,
  validateTemplate,
} from '@/lib/automations/variables';

// GET — returns the variable registry + sample data for template editor
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    variables: VARIABLE_REGISTRY,
    sampleData: SAMPLE_VARIABLES,
  });
}

// POST — validates a template and returns a live preview
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { template } = await req.json();
  if (typeof template !== 'string') {
    return NextResponse.json({ error: 'template is required' }, { status: 400 });
  }

  const validation = validateTemplate(template);

  // Render preview with sample data
  const preview = template.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) =>
    SAMPLE_VARIABLES[key] ?? `{{${key}}}`,
  );

  return NextResponse.json({
    valid: validation.valid,
    unknownVariables: validation.unknownVariables,
    suggestions: validation.suggestions,
    preview,
  });
}
