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

    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
    const MAX_ROW_LIMIT = 50_000;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({
        success: false,
        error: `CSV file exceeds the 10 MB limit (received ${Math.round(file.size / 1024 / 1024)} MB). Split the file and re-upload.`,
      }, { status: 413 });
    }

    const csvContent = await file.text();
    const result = CSVProcessorService.processCSV(csvContent);

    if (result.totalRows > MAX_ROW_LIMIT) {
      return NextResponse.json({
        success: false,
        error: `CSV contains ${result.totalRows.toLocaleString()} rows which exceeds the 50,000 row limit. Split the file and upload in batches.`,
      }, { status: 413 });
    }

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
