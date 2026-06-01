import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { CSVProcessorService } from '@/lib/broadcast/services/csv-processor.service';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const csvContent = await file.text();
    const result = CSVProcessorService.processCSV(csvContent);

    return NextResponse.json({ 
      success: true, 
      fileName: file.name,
      fileSize: `${Math.round(file.size / 1024)} KB`,
      totalRows: result.totalRows,
      validRows: result.validRows,
      invalidRows: result.invalidRows,
      duplicatesRemoved: result.duplicatesRemoved,
      contacts: result.contacts,
      normalizedNumbers: result.normalizedNumbers
    });
  } catch (error) {
    console.error('API CSV Upload Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process CSV file upload' }, { status: 500 });
  }
}
