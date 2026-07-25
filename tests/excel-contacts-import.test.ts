import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

function parseSpreadsheetBuffer(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
  return rawRows
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

describe('Excel (.xlsx) and CSV Spreadsheet Import Engine', () => {
  it('correctly parses .xlsx binary buffers into rows matrix', () => {
    // Generate an in-memory XLSX workbook
    const ws = XLSX.utils.aoa_to_sheet([
      ['name', 'phone', 'email'],
      ['Suryakant Sir', '919887064208', 'suryakant@lazymojo.com'],
      ['Kavya', '919875152290', 'kavya@lazymojo.com'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts');

    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsedRows = parseSpreadsheetBuffer(xlsxBuffer);

    expect(parsedRows.length).toBe(3);
    expect(parsedRows[0]).toEqual(['name', 'phone', 'email']);
    expect(parsedRows[1]).toEqual(['Suryakant Sir', '919887064208', 'suryakant@lazymojo.com']);
    expect(parsedRows[2]).toEqual(['Kavya', '919875152290', 'kavya@lazymojo.com']);
  });

  it('correctly parses .csv buffers into rows matrix', () => {
    const csvContent = 'name,phone,notes\nTest Contact,918233451667,VIP Guest';
    const csvBuffer = Buffer.from(csvContent, 'utf-8');
    const parsedRows = parseSpreadsheetBuffer(csvBuffer);

    expect(parsedRows.length).toBe(2);
    expect(parsedRows[0]).toEqual(['name', 'phone', 'notes']);
    expect(parsedRows[1]).toEqual(['Test Contact', '918233451667', 'VIP Guest']);
  });
});
