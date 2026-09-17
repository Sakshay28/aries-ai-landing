// Browser-only: make any image the browser can decode sendable as a WhatsApp photo.
//
// WhatsApp photos must be JPEG or PNG and ≤ 5 MB. Phone cameras routinely produce
// 6-12 MB JPEGs, and operators paste WebP/GIF/SVG (QR generators often export
// SVG). Instead of failing at Meta, re-encode to JPEG on a white background —
// transparent QR codes would otherwise turn black-on-black — shrinking quality,
// then dimensions, until it fits. JPEG/PNG already within limits are sent
// byte-for-byte untouched, so a QR screenshot stays pixel-perfect.

import { WA_IMAGE_MAX_BYTES } from './outbound-media';

const WHATSAPP_NATIVE_IMAGES = new Set(['image/jpeg', 'image/png']);
const MAX_EDGE = 4096;
// Vector QR codes often declare a tiny intrinsic size; rasterize large enough to scan.
const MIN_VECTOR_EDGE = 1024;
const QUALITY_STEPS = [0.92, 0.85, 0.75, 0.65];
const MAX_SHRINK_PASSES = 5;

export function imageNeedsConversion(mimeType: string, size: number): boolean {
  if (!mimeType.startsWith('image/')) return false;
  return !WHATSAPP_NATIVE_IMAGES.has(mimeType) || size > WA_IMAGE_MAX_BYTES;
}

export function fitWithin(width: number, height: number, maxEdge: number, minEdge = 0): { width: number; height: number } {
  const w = width > 0 ? width : MIN_VECTOR_EDGE;
  const h = height > 0 ? height : MIN_VECTOR_EDGE;
  const longest = Math.max(w, h);
  let scale = Math.min(1, maxEdge / longest);
  if (minEdge && longest * scale < minEdge) scale = minEdge / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export function toJpegFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'photo';
  return `${base}.jpg`;
}

interface Decoded {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  close: () => void;
}

function loadViaImageElement(file: Blob): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode_failed'));
    };
    img.src = url;
  });
}

async function decode(file: File, mimeType: string): Promise<Decoded> {
  if (mimeType !== 'image/svg+xml' && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        close: () => bitmap.close(),
      };
    } catch {
      /* fall through — Safari decodes HEIC via <img> but not createImageBitmap */
    }
  }
  return loadViaImageElement(file);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function convertImageForWhatsApp(file: File, mimeType: string): Promise<File> {
  let decoded: Decoded;
  try {
    decoded = await decode(file, mimeType);
  } catch {
    throw new Error('This image format can’t be opened in your browser. Please send a JPG or PNG.');
  }

  try {
    const isVector = mimeType === 'image/svg+xml';
    let { width, height } = fitWithin(decoded.width, decoded.height, MAX_EDGE, isVector ? MIN_VECTOR_EDGE : 0);
    const canvas = document.createElement('canvas');

    for (let pass = 0; pass < MAX_SHRINK_PASSES; pass++) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Your browser couldn’t prepare this image.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      decoded.draw(ctx, width, height);

      for (const quality of QUALITY_STEPS) {
        let blob: Blob | null;
        try {
          blob = await canvasToBlob(canvas, quality);
        } catch {
          throw new Error('This image can’t be converted. Please send a JPG or PNG.');
        }
        if (blob && blob.size > 0 && blob.size <= WA_IMAGE_MAX_BYTES) {
          return new File([blob], toJpegFileName(file.name), { type: 'image/jpeg', lastModified: Date.now() });
        }
      }
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
    }
    throw new Error('This photo is too large to send, even after compressing.');
  } finally {
    decoded.close();
  }
}
