"use client";

import { useState } from "react";
import {
  FileText, FileArchive, File, Music, Video, Download,
  Play, Pause, ExternalLink, Maximize2, X, ImageOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── helpers ──────────────────────────────────────────────────────────────────
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function getMediaCategory(mimeType: string): 'image' | 'video' | 'audio' | 'document' | 'archive' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType === 'application/pdf' ||
    mimeType.includes('document') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('presentation') ||
    mimeType === 'text/plain' ||
    mimeType === 'text/csv'
  ) return 'document';
  if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive';
  return 'file';
}

function docIcon(mimeType: string) {
  if (mimeType.includes('zip') || mimeType.includes('rar')) return FileArchive;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.startsWith('video/')) return Video;
  return FileText;
}

function docColor(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'text-red-500';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'text-green-600';
  if (mimeType.includes('presentation')) return 'text-orange-500';
  if (mimeType.includes('zip') || mimeType.includes('rar')) return 'text-amber-500';
  return 'text-blue-500';
}

// ─── Image Lightbox ───────────────────────────────────────────────────────────
function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Audio Player ─────────────────────────────────────────────────────────────
function AudioPlayer({ src, isOutbound }: { src: string; isOutbound: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const toggle = () => {
    if (!audioEl) {
      const a = new Audio(src);
      a.onended = () => setPlaying(false);
      a.play();
      setAudioEl(a);
      setPlaying(true);
    } else if (playing) {
      audioEl.pause();
      setPlaying(false);
    } else {
      audioEl.play();
      setPlaying(true);
    }
  };

  return (
    <div className="flex items-center gap-2 py-1">
      <button
        onClick={toggle}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
          "bg-black/[0.07] hover:bg-black/[0.12] text-[#54656F] dark:bg-white/15 dark:hover:bg-white/25 dark:text-[#E9EDEF]",
          isOutbound && "dark:bg-white/20"
        )}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 h-1 rounded-full bg-black/10 dark:bg-white/15">
        <div className="h-full w-0 rounded-full bg-current transition-all" />
      </div>
      <Music className="w-3.5 h-3.5 flex-shrink-0 text-[#667781] dark:text-[#8696A0]" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface AttachmentBubbleProps {
  mediaUrl: string;
  fileName: string;
  fileSize?: number | null;
  mimeType: string;
  caption?: string | null;
  isOutbound: boolean;
  isOptimistic?: boolean;
}

export default function AttachmentBubble({
  mediaUrl,
  fileName,
  fileSize,
  mimeType,
  caption,
  isOutbound,
  isOptimistic,
}: AttachmentBubbleProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const category = getMediaCategory(mimeType);

  // ── Image ──────────────────────────────────────────────────────────────────
  if (category === 'image') {

    return (
      <>
        {lightboxOpen && !imgError && (
          <ImageLightbox src={mediaUrl} alt={fileName} onClose={() => setLightboxOpen(false)} />
        )}
        {/* Fixed media column — bubble hugs the image and the caption wraps
            underneath at the same width (WhatsApp behavior), instead of a long
            caption stretching the bubble far wider than the image. */}
        <div className="w-[280px] max-w-full">
          <div
            className={cn("relative group cursor-pointer", imgError && "cursor-default")}
            onClick={() => !imgError && setLightboxOpen(true)}
          >
            {/* Loading skeleton — shown until image loads or errors */}
            {!imgLoaded && !imgError && (
              <div className="w-full h-[200px] rounded-md animate-pulse bg-black/10 dark:bg-white/10" />
            )}

            {/* Error state — shown when image URL is broken/expired */}
            {imgError ? (
              <div className="w-full h-[140px] rounded-md flex flex-col items-center justify-center gap-2 bg-black/[0.06] dark:bg-white/[0.08]">
                <ImageOff className="w-8 h-8 text-[#667781]/50 dark:text-[#8696A0]/50" />
                <span className="text-[11px] text-[#667781] dark:text-[#8696A0]">
                  Image unavailable
                </span>
                <a
                  href={mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] hover:underline font-medium text-[#027EB5] dark:text-[#53BDEB]"
                >
                  Open link ↗
                </a>
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl}
                  alt={fileName}
                  loading="lazy"
                  onLoad={() => setImgLoaded(true)}
                  onError={() => {
                    setImgError(true);
                    setImgLoaded(true); // stop the loading skeleton
                  }}
                  className={cn(
                    "w-full max-h-[340px] rounded-md object-cover transition-opacity duration-200",
                    imgLoaded ? "opacity-100" : "opacity-0 absolute inset-0"
                  )}
                />
                {/* Expand overlay */}
                <div className="absolute inset-0 rounded-md bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </>
            )}

            {isOptimistic && !imgError && (
              <div className="absolute inset-0 rounded-md bg-black/30 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
          {caption && (
            <p className="text-[13px] leading-relaxed mt-1.5 px-1 [word-break:normal] break-words">
              {caption}
            </p>
          )}
        </div>
      </>
    );
  }

  // ── Video ──────────────────────────────────────────────────────────────────
  if (category === 'video') {
    return (
      <div className="w-[280px] max-w-full">
        <div className="relative">
          <video
            src={mediaUrl}
            controls
            preload="metadata"
            className="w-full max-h-[240px] rounded-md object-cover"
            style={{ background: '#000' }}
          />
          {isOptimistic && (
            <div className="absolute inset-0 rounded-md bg-black/50 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
        {caption && (
          <p className="text-[13px] leading-relaxed mt-1.5 px-1 [word-break:normal] break-words">
            {caption}
          </p>
        )}
      </div>
    );
  }

  // ── Audio ──────────────────────────────────────────────────────────────────
  if (category === 'audio') {
    return (
      <div className={cn("w-[200px] px-1 py-0.5", isOptimistic && "opacity-60")}>
        <AudioPlayer src={mediaUrl} isOutbound={isOutbound} />
        <p className="text-[11px] mt-0.5 truncate text-[#667781] dark:text-[#8696A0]">
          {fileName}
          {fileSize ? ` · ${formatBytes(fileSize)}` : ''}
        </p>
      </div>
    );
  }

  // ── Document / Archive / Generic File ─────────────────────────────────────
  const DocIcon = docIcon(mimeType);
  const iconColor = docColor(mimeType);

  return (
    <div className={cn(
      "flex items-center gap-3 min-w-[180px] max-w-[240px] rounded-md px-2 py-2",
      // Subtle inset panel like WhatsApp's document card
      isOutbound ? "bg-black/[0.04] dark:bg-black/[0.12]" : "bg-black/[0.03] dark:bg-white/[0.04]",
      isOptimistic && "opacity-60"
    )}>
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white dark:bg-white/[0.08]">
        {isOptimistic
          ? <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin opacity-60" />
          : <DocIcon className={cn("w-5 h-5", iconColor)} />
        }
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium leading-tight truncate text-[#111B21] dark:text-[#E9EDEF]">
          {fileName}
        </p>
        {fileSize && (
          <p className="text-[11px] mt-0.5 text-[#667781] dark:text-[#8696A0]">
            {formatBytes(fileSize)}
          </p>
        )}
      </div>

      {/* Download / Open */}
      {!isOptimistic && (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={fileName}
          onClick={e => e.stopPropagation()}
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors text-[#667781] dark:text-[#8696A0] hover:text-[#111B21] dark:hover:text-[#E9EDEF] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
          title={`Open ${fileName}`}
        >
          {mimeType === 'application/pdf' || mimeType === 'text/plain'
            ? <ExternalLink className="w-3.5 h-3.5" />
            : <Download className="w-3.5 h-3.5" />
          }
        </a>
      )}
    </div>
  );
}

// ─── Pending attachment preview (before send) ─────────────────────────────────
interface PendingAttachmentProps {
  file: File;
  onRemove: () => void;
}

export function PendingAttachment({ file, onRemove }: PendingAttachmentProps) {
  const mimeType = file.type || 'application/octet-stream';
  const category = getMediaCategory(mimeType);
  const [previewUrl] = useState(() =>
    category === 'image' || category === 'video' ? URL.createObjectURL(file) : null
  );

  const DocIcon = docIcon(mimeType);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-[#1C2333] rounded-xl shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.06] relative max-w-[280px]">
      {/* Preview / icon */}
      {category === 'image' && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={file.name}
          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0">
          <DocIcon className={cn("w-5 h-5", docColor(mimeType))} />
        </div>
      )}

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-foreground leading-tight truncate">{file.name}</p>
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{formatBytes(file.size)}</p>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="w-5 h-5 rounded-full bg-black/[0.08] dark:bg-white/[0.08] flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-black/[0.12] dark:hover:bg-white/[0.12] transition-colors flex-shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
