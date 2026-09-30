// ═══════════════════════════════════════════════════════════
// Media Understanding — Gemini vision/video analysis for the
// AI Knowledge Media Library.
//
// Turns an uploaded image/video into structured, searchable
// metadata (title/description/tags/category/OCR text) so the
// AI Assistant can retrieve it semantically instead of by
// exact filename match. PDFs keep their existing raw-text
// extraction (route.ts) — classifyPdfText() only adds the
// same tags/category metadata on top of that already-extracted
// text, without re-uploading the PDF bytes to Gemini.
// ═══════════════════════════════════════════════════════════

import { getAI } from '@/lib/ai/client';

const VISION_MODEL = 'gemini-2.5-flash';

export interface MediaAnalysisResult {
  title:       string;
  description: string;
  tags:        string[];
  category:    string;
  ocrText:     string;
}

const CATEGORY_HINT =
  'Food, Drinks, Decor, Rooms, Banquet, Wedding, Birthday, Corporate, Offers, Menus, Policies, Events, Gallery, Products, Services';

function parseJsonResponse(text: string): Record<string, unknown> {
  let cleaned = (text || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace !== -1 && lastBrace < cleaned.length - 1) {
    cleaned = cleaned.slice(0, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

function toResult(raw: Record<string, unknown>): MediaAnalysisResult {
  return {
    title:       typeof raw.title === 'string' ? raw.title.slice(0, 200) : '',
    description: typeof raw.description === 'string' ? raw.description.slice(0, 2000) : '',
    tags:        Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string').slice(0, 20) : [],
    category:    typeof raw.category === 'string' ? raw.category.slice(0, 60) : '',
    ocrText:     typeof raw.ocr_text === 'string' ? raw.ocr_text.slice(0, 4000) : '',
  };
}

const EMPTY_RESULT: MediaAnalysisResult = { title: '', description: '', tags: [], category: '', ocrText: '' };

// ── Analyze an image: objects, decor, food, pricing, text, mood, occasion ──
export async function analyzeImage(buffer: Buffer, mimeType: string): Promise<MediaAnalysisResult> {
  const prompt = `You are cataloguing an image for a business's WhatsApp AI assistant knowledge base. Look at the image and describe what a customer would see and want to know.

Return ONLY a JSON object with these exact keys:
{
  "title": "short 3-6 word title (e.g. 'Birthday Decoration Setup')",
  "description": "1-3 sentence description of what's in the image — setting, objects, food, decor, mood, occasion, colors. Written so a customer's question about it can be matched to this description.",
  "tags": ["5-12 short lowercase keyword tags a customer might use to ask for this"],
  "category": "one of: ${CATEGORY_HINT} — pick the single best fit, or invent a short one if none fit",
  "ocr_text": "any readable text, prices, menu items, or signage visible in the image — empty string if none"
}`;

  try {
    const response = await getAI().models.generateContent({
      model: VISION_MODEL,
      contents: [
        { inlineData: { mimeType, data: buffer.toString('base64') } },
        prompt,
      ],
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    return toResult(parseJsonResponse(response.text || ''));
  } catch (err) {
    console.error('media-analysis: analyzeImage failed:', (err as Error).message);
    return EMPTY_RESULT;
  }
}

// ── Analyze a video: Gemini understands audio+visual in a single pass ──
export async function analyzeVideo(buffer: Buffer, mimeType: string): Promise<MediaAnalysisResult> {
  const prompt = `You are cataloguing a short video for a business's WhatsApp AI assistant knowledge base. Watch and listen to the video and summarize what a customer would see and want to know.

Return ONLY a JSON object with these exact keys:
{
  "title": "short 3-6 word title (e.g. 'Rooftop Terrace Seating')",
  "description": "1-3 sentence summary of the video — setting, what's shown, any spoken narration, mood, occasion it suits. Written so a customer's question about it can be matched to this description.",
  "tags": ["5-12 short lowercase keyword tags a customer might use to ask for this"],
  "category": "one of: ${CATEGORY_HINT} — pick the single best fit, or invent a short one if none fit",
  "ocr_text": "any readable on-screen text, prices, or spoken key phrases worth indexing — empty string if none"
}`;

  try {
    const response = await getAI().models.generateContent({
      model: VISION_MODEL,
      contents: [
        { inlineData: { mimeType, data: buffer.toString('base64') } },
        prompt,
      ],
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    return toResult(parseJsonResponse(response.text || ''));
  } catch (err) {
    console.error('media-analysis: analyzeVideo failed:', (err as Error).message);
    return EMPTY_RESULT;
  }
}

import * as zlib from 'zlib';
import * as XLSX from 'xlsx';

// ── Extract text from DOCX files by reading word/document.xml from ZIP ──
export function extractDocxText(buffer: Buffer): string {
  try {
    let offset = 0;
    while (offset < buffer.length - 4) {
      if (buffer.readUInt32LE(offset) === 0x04034b50) {
        const compMethod = buffer.readUInt16LE(offset + 8);
        const compSize = buffer.readUInt32LE(offset + 18);
        const fnLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const filename = buffer.slice(offset + 30, offset + 30 + fnLen).toString('utf8');
        const dataOffset = offset + 30 + fnLen + extraLen;

        if (filename === 'word/document.xml') {
          const compData = buffer.slice(dataOffset, dataOffset + compSize);
          let xml = '';
          if (compMethod === 8) {
            xml = zlib.inflateRawSync(compData).toString('utf8');
          } else if (compMethod === 0) {
            xml = compData.toString('utf8');
          }
          return xml
            .replace(/<w:p[^>]*>/g, '\n')
            .replace(/<w:tab\/>/g, '\t')
            .replace(/<w:br\/>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/\n\s*\n/g, '\n')
            .trim();
        }
        offset = dataOffset + compSize;
      } else {
        offset++;
      }
    }
  } catch (err) {
    console.error('media-analysis: extractDocxText failed:', (err as Error).message);
  }
  return '';
}

// ── Extract text from PPTX files by reading slide XMLs from ZIP ──
export function extractPptxText(buffer: Buffer): string {
  try {
    let offset = 0;
    const slides: Array<{ num: number; text: string }> = [];
    while (offset < buffer.length - 4) {
      if (buffer.readUInt32LE(offset) === 0x04034b50) {
        const compMethod = buffer.readUInt16LE(offset + 8);
        const compSize = buffer.readUInt32LE(offset + 18);
        const fnLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const filename = buffer.slice(offset + 30, offset + 30 + fnLen).toString('utf8');
        const dataOffset = offset + 30 + fnLen + extraLen;

        const match = filename.match(/^ppt\/slides\/slide(\d+)\.xml$/);
        if (match) {
          const slideNum = parseInt(match[1], 10);
          const compData = buffer.slice(dataOffset, dataOffset + compSize);
          let xml = '';
          if (compMethod === 8) {
            xml = zlib.inflateRawSync(compData).toString('utf8');
          } else if (compMethod === 0) {
            xml = compData.toString('utf8');
          }
          const text = xml
            .replace(/<a:p[^>]*>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/\n\s*\n/g, '\n')
            .trim();
          if (text) slides.push({ num: slideNum, text });
        }
        offset = dataOffset + compSize;
      } else {
        offset++;
      }
    }
    slides.sort((a, b) => a.num - b.num);
    return slides.map(s => `Slide ${s.num}:\n${s.text}`).join('\n\n');
  } catch (err) {
    console.error('media-analysis: extractPptxText failed:', (err as Error).message);
  }
  return '';
}

// ── Extract text from Excel (XLSX, XLS) or CSV spreadsheets ──
export function extractSpreadsheetText(buffer: Buffer): string {
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    let text = '';
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (sheet) {
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) {
          text += `Sheet: ${name}\n${csv}\n\n`;
        }
      }
    }
    return text.trim();
  } catch (err) {
    console.error('media-analysis: extractSpreadsheetText failed:', (err as Error).message);
    return '';
  }
}

// ── Extract raw text from a PDF via Gemini ──
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const response = await getAI().models.generateContent({
      model: VISION_MODEL,
      contents: [
        { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
        'Extract all text content from this document exactly as it is written. Do not summarize, do not translate, do not add any comments. Just return the raw extracted text.',
      ],
    });
    return response.text || '';
  } catch (err) {
    console.error('media-analysis: extractPdfText failed:', (err as Error).message);
    return '';
  }
}

// ── Unified Document Text Extractor ──
export async function extractDocumentText(buffer: Buffer, ext: string): Promise<string> {
  const normExt = ext.toLowerCase().trim();
  if (normExt === 'pdf') {
    return extractPdfText(buffer);
  }
  if (normExt === 'xlsx' || normExt === 'xls' || normExt === 'csv') {
    return extractSpreadsheetText(buffer);
  }
  if (normExt === 'docx') {
    return extractDocxText(buffer);
  }
  if (normExt === 'pptx') {
    return extractPptxText(buffer);
  }
  if (['txt', 'md', 'json', 'html', 'xml'].includes(normExt)) {
    return buffer.toString('utf-8');
  }
  // Fallback: try utf-8 string or regex printable ASCII/Unicode
  try {
    const str = buffer.toString('utf-8');
    if (/[\x20-\x7E\s]{10,}/.test(str)) return str;
  } catch {}
  return '';
}

// ── Classify extracted document text: title/description/tags/category ──
export async function classifyDocText(contentText: string, filename: string): Promise<Pick<MediaAnalysisResult, 'title' | 'description' | 'tags' | 'category'>> {
  if (!contentText.trim()) return { title: '', description: '', tags: [], category: '' };

  const prompt = `This is the extracted text of a business document named "${filename}", used in a WhatsApp AI assistant's knowledge base.

Return ONLY a JSON object with these exact keys:
{
  "title": "short 3-6 word title describing what this document is (e.g. 'Cocktail Menu', 'Banquet Package Brochure')",
  "description": "1-2 sentence description of what this document contains, written so a customer's question about it can be matched to this description (e.g. 'Full food menu with starters, mains, and desserts, vegetarian and non-vegetarian options with prices in INR.')",
  "tags": ["5-12 short lowercase keyword tags a customer might use to ask for this document"],
  "category": "one of: ${CATEGORY_HINT} — pick the single best fit, or invent a short one if none fit"
}

DOCUMENT TEXT (truncated):
${contentText.slice(0, 6000)}`;

  try {
    const response = await getAI().models.generateContent({
      model: VISION_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    const raw = parseJsonResponse(response.text || '');
    return {
      title: typeof raw.title === 'string' ? raw.title.slice(0, 200) : '',
      description: typeof raw.description === 'string' ? raw.description.slice(0, 2000) : '',
      tags:  Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string').slice(0, 20) : [],
      category: typeof raw.category === 'string' ? raw.category.slice(0, 60) : '',
    };
  } catch (err) {
    console.error('media-analysis: classifyDocText failed:', (err as Error).message);
    return { title: '', description: '', tags: [], category: '' };
  }
}

// Backward-compatible alias for existing imports
export const classifyPdfText = classifyDocText;

// ── Build the embeddable text blob from analysis output ──────────────
export function buildContentText(filename: string, result: MediaAnalysisResult): string {
  return [
    result.title,
    result.description,
    result.tags.length ? `Tags: ${result.tags.join(', ')}` : '',
    result.category ? `Category: ${result.category}` : '',
    result.ocrText,
  ].filter(Boolean).join('\n');
}
