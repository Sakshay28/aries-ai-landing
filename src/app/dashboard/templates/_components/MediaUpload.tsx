'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, X, RefreshCw, FileImage, FileVideo, FileText as FilePdf, Loader2, CheckCircle2 } from 'lucide-react';
import type { HeaderType } from './types';
import { MEDIA_CONSTRAINTS } from './constants';

interface Props {
  headerType: Exclude<HeaderType, 'NONE' | 'TEXT'>;
  currentUrl?: string;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
}

const ICONS = {
  IMAGE: FileImage,
  VIDEO: FileVideo,
  DOCUMENT: FilePdf,
};

export default function MediaUpload({ headerType, currentUrl, onUploaded, onRemoved }: Props) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl ?? null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const constraints = MEDIA_CONSTRAINTS[headerType];
  const Icon = ICONS[headerType];

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);

    // Client-side MIME check
    if (!constraints.mimes.includes(file.type)) {
      setError(`Unsupported format: "${file.name}". Accepted formats: ${constraints.extensions.join(', ').toUpperCase()}`);
      return;
    }

    // Client-side size check
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > constraints.maxSizeMB) {
      setError(`File size is ${sizeMB.toFixed(1)} MB, which exceeds the ${constraints.maxSizeMB} MB limit.`);
      return;
    }

    // Instant local preview for images
    if (headerType === 'IMAGE') {
      const reader = new FileReader();
      reader.onload = (e) => setPreviewUrl(e.target?.result as string);
      reader.readAsDataURL(file);
    }

    setIsUploading(true);
    setProgress(0);

    // Simulate progress smoothly in the UI
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + Math.random() * 12, 88));
    }, 200);

    try {
      abortRef.current = new AbortController();
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/dashboard/templates/upload', {
        method: 'POST',
        body: formData,
        signal: abortRef.current.signal,
      });

      clearInterval(progressInterval);
      setProgress(100);

      const json = await res.json() as { success: boolean; url?: string; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Upload failed');
      }

      // For non-images, show the URL as preview
      if (headerType !== 'IMAGE') {
        setPreviewUrl(json.url!);
      }

      onUploaded(json.url!);
    } catch (err) {
      clearInterval(progressInterval);
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message);
      setPreviewUrl(currentUrl ?? null);
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  }, [headerType, constraints, currentUrl, onUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    setFileName(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    onRemoved();
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    abortRef.current?.abort();
    setIsUploading(false);
    setProgress(0);
    setPreviewUrl(currentUrl ?? null);
  };

  const triggerInput = () => {
    inputRef.current?.click();
  };

  return (
    <div className="space-y-3 w-full">
      {/* Redesigned Card Container */}
      <div 
        onDrop={isUploading ? undefined : handleDrop}
        onDragOver={isUploading ? undefined : (e) => e.preventDefault()}
        onClick={isUploading || previewUrl ? undefined : triggerInput}
        className={`relative w-full rounded-2xl border transition-all duration-300 select-none overflow-hidden group bg-card ${
          previewUrl && !isUploading
            ? 'border-border/60 shadow-sm'
            : isUploading
            ? 'border-primary/45 p-6 bg-primary/[0.01]'
            : 'border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-muted/10 cursor-pointer p-6'
        }`}
      >
        {/* 1. UPLOADING STATE OVERLAY */}
        {isUploading && (
          <div className="flex flex-col items-center justify-center space-y-4 py-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
            <div className="text-center space-y-1.5 w-full max-w-[200px]">
              <p className="text-xs font-semibold text-foreground/90">Preparing media preview...</p>
              <p className="text-[10px] text-muted-foreground/70">Processing upload...</p>
              
              {/* Progress Line */}
              <div className="h-1 bg-muted rounded-full overflow-hidden w-full mt-2">
                <div 
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              
              <div className="flex items-center justify-between mt-1 select-none">
                <span className="text-[9px] text-muted-foreground font-semibold">{Math.round(progress)}%</span>
                <button 
                  onClick={handleCancel}
                  className="text-[9px] text-red-500 font-bold hover:underline select-none cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. SUCCESS / EXISTING PREVIEW STATE */}
        {previewUrl && !isUploading && (
          <div className="relative">
            {headerType === 'IMAGE' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Header Preview" className="w-full aspect-[2/1] object-cover rounded-xl" />
            ) : headerType === 'VIDEO' ? (
              <div className="w-full aspect-[2/1] bg-slate-950 flex flex-col items-center justify-center rounded-xl relative border border-slate-900 shadow-inner">
                <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xs flex items-center justify-center shadow-md select-none">
                  <span className="text-white text-xs ml-0.5">▶</span>
                </div>
                <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider mt-2.5 select-none">Video Ready</span>
              </div>
            ) : (
              <div className="w-full p-4 flex items-center gap-3 bg-muted/20 border border-border/40 rounded-xl">
                <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/15 flex items-center justify-center shrink-0">
                  <FilePdf className="w-5 h-5 text-red-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">{fileName || 'Document.pdf'}</p>
                  <p className="text-[10px] text-muted-foreground/80 font-medium">Ready for Meta submission</p>
                </div>
              </div>
            )}

            {/* Float Upload Success Badge */}
            <div className="absolute top-3 left-3 select-none flex items-center gap-1.5 bg-emerald-500/90 backdrop-blur-xs text-white text-[9.5px] font-bold px-2 py-0.5 rounded-md shadow-sm border border-emerald-400/20">
              <CheckCircle2 className="w-3 h-3 text-white" />
              <span>Uploaded</span>
            </div>

            {/* Hover Actions Glossy Overlay Panel */}
            <div className="absolute inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center gap-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl">
              <button
                onClick={triggerInput}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-800 hover:bg-slate-50 text-xs font-bold rounded-lg shadow-md transition-all active:scale-[0.97]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Replace
              </button>
              <button
                onClick={handleRemove}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg shadow-md transition-all active:scale-[0.97]"
              >
                <X className="w-3.5 h-3.5" />
                Remove
              </button>
            </div>
          </div>
        )}

        {/* 3. EMPTY STATE / DROPZONE */}
        {!previewUrl && !isUploading && (
          <div className="flex flex-col items-center gap-3 py-2 text-center select-none">
            <div className="w-11 h-11 rounded-xl bg-muted/60 border border-border/40 group-hover:bg-primary/5 transition-colors flex items-center justify-center shadow-inner">
              <Icon className="w-5.5 h-5.5 text-muted-foreground/85 group-hover:text-primary transition-colors" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground/90 leading-tight">
                Drop {headerType.toLowerCase()} here, or <span className="text-primary hover:underline">browse</span>
              </p>
              <p className="text-[10px] text-muted-foreground/60 font-medium">
                {constraints.extensions.join(', ').toUpperCase()} · Max {constraints.maxSizeMB} MB
              </p>
            </div>
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/80 hover:bg-muted text-foreground/85 hover:text-foreground border border-border/60 rounded-md text-[11px] font-semibold shadow-sm active:scale-[0.98] transition-all"
            >
              <Upload className="w-3 h-3 text-muted-foreground" />
              Choose File
            </button>
          </div>
        )}
      </div>

      {/* Expandable Developer Error Details */}
      {error && (
        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-red-500/5 border border-red-500/10 text-xs select-none">
          <div className="flex items-start gap-2 text-red-600 dark:text-red-400 font-medium leading-relaxed">
            <span className="text-[13px] leading-none mt-0.5">⚠️</span>
            <span>We couldn't upload your media. Please try again.</span>
          </div>
          <details className="text-[10px] text-muted-foreground/85 mt-1 cursor-pointer select-none">
            <summary className="hover:underline focus:outline-none font-semibold">Show developer details</summary>
            <pre className="mt-1.5 p-2 bg-muted/50 rounded border border-border/40 font-mono text-[9px] whitespace-pre-wrap max-h-24 overflow-y-auto leading-normal text-muted-foreground">
              {error}
            </pre>
          </details>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={constraints.accept}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
