"use client";

import React, { useRef, useState } from 'react';
import { UploadCloud, Image as ImageIcon, Video, FileText, X, CheckCircle2, AlertTriangle, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Template } from '../types';

type HeaderKind = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

const KIND_CONFIG: Record<HeaderKind, {
  label: string;
  accept: string;
  hint: string;
  Icon: React.ElementType;
}> = {
  IMAGE:    { label: 'header image',    accept: 'image/jpeg,image/png',                                                          hint: 'JPEG or PNG · up to 5 MB (auto-compressed)', Icon: ImageIcon },
  VIDEO:    { label: 'header video',    accept: 'video/mp4',                                                                     hint: 'MP4 · up to 16 MB',                          Icon: Video },
  DOCUMENT: { label: 'header document', accept: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', hint: 'PDF, DOC or DOCX · up to 100 MB', Icon: FileText },
};

function isHttps(url: string) {
  return /^https:\/\//i.test(url.trim());
}

/**
 * Upload / attach the header media a template requires. Renders ONLY when the
 * selected template has an IMAGE / VIDEO / DOCUMENT header — text-only and
 * no-header templates need nothing here. The resolved public HTTPS URL is
 * stored on the campaign (broadcast_campaigns.header_media_url) and sent as the
 * Meta header parameter on every message.
 */
export function MediaHeaderUpload({
  template,
  value,
  onChange,
}: {
  template: Template | null;
  value: string;
  onChange: (url: string) => void;
}) {
  const headerType = (template?.headerType || '').toUpperCase();
  const isMedia = headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT';
  const cfg = isMedia ? KIND_CONFIG[headerType as HeaderKind] : null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');

  if (!isMedia || !cfg) return null;

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/dashboard/templates/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.url) {
        onChange(data.url);
        toast.success(`${cfg.label[0].toUpperCase() + cfg.label.slice(1)} uploaded`);
      } else {
        toast.error(data.error || 'Upload failed');
      }
    } catch {
      toast.error('Upload failed — check your connection and try again');
    } finally {
      setUploading(false);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (file) handleFile(file);
  };

  const applyUrl = () => {
    const u = urlDraft.trim();
    if (!isHttps(u)) {
      toast.error('The link must start with https:// and be publicly accessible');
      return;
    }
    onChange(u);
    setShowUrlInput(false);
    setUrlDraft('');
    toast.success('Header media link set');
  };

  const Icon = cfg.Icon;
  const hasValue = !!value;
  const badUrl = hasValue && !isHttps(value);

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.03] p-4 space-y-3">
      {/* Header / requirement notice */}
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-foreground">
            This template requires a {cfg.label}
          </p>
          <p className="text-[11.5px] text-muted-foreground/85 mt-0.5 leading-relaxed">
            WhatsApp attaches this {headerType.toLowerCase()} to the top of every message. Without it the broadcast will be rejected by Meta. {cfg.hint}.
          </p>
        </div>
      </div>

      {/* Current value / preview */}
      {hasValue ? (
        <div className={`flex items-center gap-3 p-2.5 rounded-xl border ${badUrl ? 'border-rose-400/40 bg-rose-500/[0.04]' : 'border-emerald-500/25 bg-emerald-500/[0.04]'}`}>
          {headerType === 'IMAGE' && !badUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Header preview" className="w-12 h-12 rounded-lg object-cover border border-border/40 shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-secondary/40 border border-border/40 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {badUrl ? <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              <span className={`text-[11.5px] font-semibold ${badUrl ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {badUrl ? 'Not a valid https:// link — replace it' : 'Attached · ready to send'}
              </span>
            </div>
            <p className="text-[10.5px] text-muted-foreground/70 truncate mt-0.5">{value}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-rose-500 hover:bg-rose-50/50 shrink-0"
            aria-label="Remove header media"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          {/* Upload dropzone */}
          <input ref={fileInputRef} type="file" accept={cfg.accept} onChange={onInputChange} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center justify-center gap-1.5 p-5 rounded-xl border border-dashed border-amber-500/40 hover:border-amber-500/70 bg-background hover:bg-amber-500/[0.03] transition-all disabled:opacity-60"
          >
            <UploadCloud className={`w-6 h-6 ${uploading ? 'animate-bounce text-amber-500' : 'text-muted-foreground/60'}`} />
            <span className="text-[12.5px] font-semibold text-foreground">
              {uploading ? 'Uploading…' : `Upload ${cfg.label}`}
            </span>
            <span className="text-[10.5px] text-muted-foreground/70">{cfg.hint}</span>
          </button>

          {/* Or paste a link */}
          {showUrlInput ? (
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyUrl()}
                placeholder="https://your-domain.com/image.jpg"
                autoFocus
                className="flex-1 h-9 px-3 bg-background border border-border/60 focus:border-indigo-500/50 rounded-lg text-[12px] outline-none"
              />
              <button type="button" onClick={applyUrl} className="h-9 px-3 text-[12px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">Set</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowUrlInput(true)}
              className="flex items-center gap-1.5 text-[11.5px] font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <Link2 className="w-3.5 h-3.5" />
              Or paste a public image link instead
            </button>
          )}
        </>
      )}
    </div>
  );
}
