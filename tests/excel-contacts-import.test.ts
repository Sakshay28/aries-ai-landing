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

  it('correctly matches headers with trailing hyphens or symbols like Name- and Phone Number-', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name-', 'Phone Number-'],
      ['pallavi', '9717704002'],
      ['yogesh sharma', '9828389367'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsedRows = parseSpreadsheetBuffer(xlsxBuffer);

    const rawHeaders = parsedRows[0].map((h) => h.trim().toLowerCase());
    const cleanHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanedHeaders = parsedRows[0].map(cleanHeader);

    const phoneIndex = cleanedHeaders.findIndex((h, i) =>
      ['phone', 'mobile', 'whatsapp', 'phonenumber', 'mobilenumber', 'contactnumber', 'contact', 'cell', 'telephone', 'number', 'ph'].includes(h) ||
      h.includes('phone') || h.includes('mobile') || h.includes('whatsapp') || h.includes('contact') || h.includes('number') ||
      rawHeaders[i].includes('phone') || rawHeaders[i].includes('mobile') || rawHeaders[i].includes('number')
    );
    const nameIndex = cleanedHeaders.findIndex((h, i) =>
      ['name', 'fullname', 'contactname', 'firstname', 'lastname', 'client', 'customer'].includes(h) ||
      h.includes('name') || h.includes('client') || h.includes('customer') ||
      rawHeaders[i].includes('name')
    );

    expect(nameIndex).toBe(0);
    expect(phoneIndex).toBe(1);
  });
});
