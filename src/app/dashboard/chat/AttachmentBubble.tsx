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
          isOutbound
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400"
        )}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className={cn(
        "flex-1 h-1 rounded-full",
        isOutbound ? "bg-white/30" : "bg-black/10 dark:bg-white/10"
      )}>
        <div className="h-full w-0 rounded-full bg-current transition-all" />
      </div>
      <Music className={cn("w-3.5 h-3.5 flex-shrink-0", isOutbound ? "text-white/60" : "text-muted-foreground/50")} />
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
        <div
          className={cn("relative group cursor-pointer", imgError && "cursor-default")}
          onClick={() => !imgError && setLightboxOpen(true)}
        >
          {/* Loading skeleton — shown until image loads or errors */}
          {!imgLoaded && !imgError && (
            <div className={cn(
              "w-[200px] h-[160px] rounded-xl animate-pulse",
              isOutbound ? "bg-white/20" : "bg-black/10 dark:bg-white/10"
            )} />
          )}

          {/* Error state — shown when image URL is broken/expired */}
          {imgError ? (
            <div className={cn(
              "w-[200px] h-[140px] rounded-xl flex flex-col items-center justify-center gap-2",
              isOutbound ? "bg-white/10" : "bg-black/[0.06] dark:bg-white/[0.06]"
            )}>
              <ImageOff className={cn("w-8 h-8", isOutbound ? "text-white/40" : "text-muted-foreground/40")} />
              <span className={cn("text-[11px]", isOutbound ? "text-white/50" : "text-muted-foreground/50")}>
                Image unavailable
              </span>
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "text-[11px] hover:underline font-medium",
                  isOutbound ? "text-white/70 hover:text-white" : "text-indigo-500 hover:text-indigo-600"
                )}
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
                  "max-w-[220px] max-h-[300px] rounded-xl object-cover transition-opacity duration-200",
                  imgLoaded ? "opacity-100" : "opacity-0 absolute inset-0"
                )}
              />
              {/* Expand overlay */}
              <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </>
          )}

          {isOptimistic && !imgError && (
            <div className="absolute inset-0 rounded-xl bg-black/30 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
        {caption && <p className="text-[13px] leading-relaxed mt-1">{caption}</p>}
      </>
    );
  }

  // ── Video ──────────────────────────────────────────────────────────────────
  if (category === 'video') {
    return (
      <div className="relative">
        <video
          src={mediaUrl}
          controls
          preload="metadata"
          className="max-w-[220px] max-h-[200px] rounded-xl object-cover"
          style={{ background: '#000' }}
        />
        {isOptimistic && (
          <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          </div>
        )}
        {caption && <p className="text-[13px] leading-relaxed mt-1">{caption}</p>}
      </div>
    );
  }

  // ── Audio ──────────────────────────────────────────────────────────────────
  if (category === 'audio') {
    return (
      <div className={cn("w-[200px]", isOptimistic && "opacity-60")}>
        <AudioPlayer src={mediaUrl} isOutbound={isOutbound} />
        <p className={cn(
          "text-[11px] mt-0.5 truncate",
          isOutbound ? "text-white/60" : "text-muted-foreground/60"
        )}>
          {fileName}
          {fileSize ? ` · ${formatBytes(fileSize)}` : ''}
        </p>
      </div>
    );
  }

  // ── Document / Archive / Generic File ─────────────────────────────────────
  const DocIcon = docIcon(mimeType);
  const iconColor = isOutbound ? 'text-white/80' : docColor(mimeType);

  return (
    <div className={cn(
      "flex items-center gap-3 min-w-[180px] max-w-[240px]",
      isOptimistic && "opacity-60"
    )}>
      {/* Icon */}
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
        isOutbound ? "bg-white/15" : "bg-black/[0.05] dark:bg-white/[0.06]"
      )}>
        {isOptimistic
          ? <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin opacity-60" />
          : <DocIcon className={cn("w-5 h-5", iconColor)} />
        }
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-[12.5px] font-medium leading-tight truncate",
          isOutbound ? "text-white" : "text-foreground"
        )}>
          {fileName}
        </p>
        {fileSize && (
          <p className={cn(
            "text-[11px] mt-0.5",
            isOutbound ? "text-white/55" : "text-muted-foreground/55"
          )}>
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
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
            isOutbound
              ? "text-white/60 hover:text-white hover:bg-white/10"
              : "text-muted-foreground/50 hover:text-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
          )}
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
