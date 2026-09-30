import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateFileSignature, computeSha256 } from '@/lib/utils/media-validation';
import { extractDocumentText, extractDocxText, extractSpreadsheetText } from '@/lib/ai/media-analysis';
import * as zlib from 'zlib';
import * as XLSX from 'xlsx';

describe('Knowledge Media Library Upload Pipeline', () => {
  describe('validateFileSignature', () => {
    it('validates PDF magic bytes', () => {
      const validPdf = Buffer.from('%PDF-1.4\nsome content\n%%EOF');
      const fakePdf = Buffer.from('NOT A REAL PDF FILE');
      expect(validateFileSignature(validPdf, 'pdf')).toBe(true);
      expect(validateFileSignature(fakePdf, 'pdf')).toBe(false);
    });

    it('validates JPEG and PNG magic bytes', () => {
      const validJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
      const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const fakeImg = Buffer.from('just some random text data');
      expect(validateFileSignature(validJpg, 'jpg')).toBe(true);
      expect(validateFileSignature(validJpg, 'jpeg')).toBe(true);
      expect(validateFileSignature(validPng, 'png')).toBe(true);
      expect(validateFileSignature(fakeImg, 'jpg')).toBe(false);
      expect(validateFileSignature(fakeImg, 'png')).toBe(false);
    });

    it('validates WebP and MP4/MOV formats', () => {
      const validWebp = Buffer.from('RIFF....WEBPVP8 ');
      const validMp4 = Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D]); // 'ftyp'
      expect(validateFileSignature(validWebp, 'webp')).toBe(true);
      expect(validateFileSignature(validMp4, 'mp4')).toBe(true);
      expect(validateFileSignature(validMp4, 'mov')).toBe(true);
    });

    it('validates DOCX, XLSX, and PPTX zip containers', () => {
      const validZip = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0, 0, 0, 0]);
      const fakeDoc = Buffer.from('corrupted docx content');
      expect(validateFileSignature(validZip, 'docx')).toBe(true);
      expect(validateFileSignature(validZip, 'xlsx')).toBe(true);
      expect(validateFileSignature(validZip, 'pptx')).toBe(true);
      expect(validateFileSignature(fakeDoc, 'docx')).toBe(false);
    });

    it('validates text formats (txt, md, csv, json)', () => {
      const textBuf = Buffer.from('# Globesome Adventure Guide\n\nFull itinerary details.');
      expect(validateFileSignature(textBuf, 'txt')).toBe(true);
      expect(validateFileSignature(textBuf, 'md')).toBe(true);
      expect(validateFileSignature(textBuf, 'csv')).toBe(true);
      expect(validateFileSignature(textBuf, 'json')).toBe(true);
    });

    it('rejects empty (0-byte) buffers', () => {
      const emptyBuf = Buffer.alloc(0);
      expect(validateFileSignature(emptyBuf, 'pdf')).toBe(false);
      expect(validateFileSignature(emptyBuf, 'txt')).toBe(false);
      expect(validateFileSignature(emptyBuf, 'docx')).toBe(false);
    });
  });

  describe('Document text extraction', () => {
    it('extracts spreadsheets (XLSX, XLS, CSV) into structured tables', async () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Package', 'Destination', 'Price'],
        ['Ladakh Expedition', 'Leh', '45000'],
        ['River Rafting', 'Rishikesh', '2500'],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Tours');
      const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const extracted = extractSpreadsheetText(xlsxBuffer);
      expect(extracted).toContain('Sheet: Tours');
      expect(extracted).toContain('Ladakh Expedition,Leh,45000');
      expect(extracted).toContain('River Rafting,Rishikesh,2500');

      const unified = await extractDocumentText(xlsxBuffer, 'xlsx');
      expect(unified).toContain('Ladakh Expedition');
    });

    it('extracts DOCX files from word/document.xml', async () => {
      const docXml = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Globesome Rafting Safety Standards</w:t></w:r></w:p></w:body></w:document>';
      const compDoc = zlib.deflateRawSync(Buffer.from(docXml, 'utf8'));
      const fn = 'word/document.xml';
      const fnBuf = Buffer.from(fn, 'utf8');

      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0, 6);
      header.writeUInt16LE(8, 8);
      header.writeUInt32LE(compDoc.length, 18);
      header.writeUInt32LE(Buffer.byteLength(docXml), 22);
      header.writeUInt16LE(fnBuf.length, 26);
      header.writeUInt16LE(0, 28);

      const docxBuffer = Buffer.concat([header, fnBuf, compDoc]);
      const extracted = extractDocxText(docxBuffer);
      expect(extracted).toContain('Globesome Rafting Safety Standards');

      const unified = await extractDocumentText(docxBuffer, 'docx');
      expect(unified).toContain('Globesome Rafting Safety Standards');
    });

    it('extracts plain text and markdown buffers directly', async () => {
      const mdContent = '# Ladakh Expedition Itinerary\n\nDay 1: Arrival in Leh';
      const buf = Buffer.from(mdContent, 'utf-8');
      const extracted = await extractDocumentText(buf, 'md');
      expect(extracted).toBe(mdContent);
    });
  });

  describe('SHA256 duplicate hashing', () => {
    it('computes deterministic hashes for identical content', () => {
      const b1 = Buffer.from('Identical document content');
      const b2 = Buffer.from('Identical document content');
      const b3 = Buffer.from('Different content');
      expect(computeSha256(b1)).toBe(computeSha256(b2));
      expect(computeSha256(b1)).not.toBe(computeSha256(b3));
    });
  });
});
