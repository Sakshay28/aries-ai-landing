"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, UploadCloud, FileText, Trash2, BrainCircuit,
  Activity, AlertCircle, CheckCircle2, FileType2, FilePdf,
  FileSpreadsheet, FileJson, X, Clock, HardDrive,
} from 'lucide-react';
import { toast } from 'sonner';

interface KnowledgeDoc {
  id: string;
  filename: string;
  file_type: string;
  content_text: string;
  file_url: string | null;
  created_at: string;
}

const ACCEPTED_TYPES = ['.txt', '.md', '.csv', '.json', '.pdf'];
const ACCEPTED_MIME = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? 'txt';
}

function FileIcon({ ext }: { ext: string }) {
  if (ext === 'pdf') return <FilePdf className="w-4 h-4 text-red-400" />;
  if (ext === 'csv') return <FileSpreadsheet className="w-4 h-4 text-green-400" />;
  if (ext === 'json') return <FileJson className="w-4 h-4 text-yellow-400" />;
  return <FileType2 className="w-4 h-4 text-blue-400" />;
}

function FileTypeBadge({ ext }: { ext: string }) {
  const colors: Record<string, string> = {
    pdf: 'bg-red-500/10 text-red-500 border-red-500/20',
    csv: 'bg-green-500/10 text-green-500 border-green-500/20',
    json: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    txt: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    md: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };
  const cls = colors[ext] ?? 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}>
      {ext}
    </span>
  );
}

export default function KnowledgeBasePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchDocs(); }, []);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/knowledge');
      const data = await res.json();
      if (data.success) setDocs(data.docs ?? []);
      else toast.error(data.error ?? 'Failed to load documents');
    } catch {
      toast.error('Network error loading documents');
    } finally {
      setLoading(false);
    }
  };

  const validateFile = (file: File): string | null => {
    const ext = '.' + getFileExtension(file.name);
    if (!ACCEPTED_TYPES.includes(ext) && !ACCEPTED_MIME.includes(file.type)) {
      return `Unsupported file type. Accepted: ${ACCEPTED_TYPES.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) return 'File must be under 10 MB';
    return null;
  };

  const handleUpload = async (file: File) => {
    const err = validateFile(file);
    if (err) { toast.error(err); return; }

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setUploadProgress(10);

    // Fake smooth progress while waiting
    const interval = setInterval(() => {
      setUploadProgress(p => Math.min(p + 8, 85));
    }, 300);

    try {
      const res = await fetch('/api/dashboard/knowledge', { method: 'POST', body: formData });
      clearInterval(interval);
      setUploadProgress(100);
      const data = await res.json();
      if (data.success) {
        toast.success(`${file.name} uploaded successfully`);
        await fetchDocs();
      } else {
        throw new Error(data.error ?? 'Upload failed');
      }
    } catch (e) {
      clearInterval(interval);
      toast.error((e as Error).message);
    } finally {
      setTimeout(() => { setUploading(false); setUploadProgress(0); }, 500);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleDelete = async (doc: KnowledgeDoc) => {
    if (!confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    try {
      const res = await fetch(`/api/dashboard/knowledge?id=${doc.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Document deleted');
        setDocs(prev => prev.filter(d => d.id !== doc.id));
      } else {
        const data = await res.json();
        throw new Error(data.error ?? 'Delete failed');
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  // Stats
  const totalChars = docs.reduce((acc, d) => acc + (d.content_text?.length ?? 0), 0);
  const totalMB = (totalChars / (1024 * 1024)).toFixed(2);
  const pdfCount = docs.filter(d => d.file_type === 'pdf').length;
  const readyCount = docs.filter(d => d.file_type !== 'pdf').length;

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8">
      <div className="max-w-[1040px] mx-auto w-full space-y-8">

        {/* Header */}
        <header className="flex items-start justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
              Upload menus, FAQs, policies, and product details. The AI reads these files to answer
              customer questions accurately. Supported: <span className="font-mono text-foreground">.txt .md .csv .json .pdf</span>
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
          >
            <UploadCloud className="w-4 h-4" />
            Upload File
          </button>
        </header>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: HardDrive, color: 'text-indigo-500', bg: 'bg-indigo-500/10', label: 'Total Knowledge', value: `${totalMB} MB` },
            { icon: FileText, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Documents', value: `${docs.length}` },
            { icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Training Health', value: docs.length > 0 ? (readyCount === docs.length ? '100% Optimal' : `${readyCount}/${docs.length} Ready`) : '—' },
          ].map(({ icon: Icon, color, bg, label, value }) => (
            <div key={label} className="flex items-center gap-4 p-5 rounded-2xl bg-card border border-border shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
              <div className={`p-3 rounded-xl ${bg} ${color}`}><Icon className="w-5 h-5" /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold text-foreground mt-0.5">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Upload zone + document list */}
          <div className="lg:col-span-2 space-y-6">

            {/* Drop zone */}
            <div
              className={`relative flex flex-col items-center justify-center p-10 text-center rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer ${
                dragActive ? 'border-indigo-500 bg-indigo-500/5 scale-[1.01]' : 'border-border/60 hover:border-border bg-card'
              } ${uploading ? 'pointer-events-none' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
                accept={ACCEPTED_TYPES.join(',')}
                disabled={uploading}
                id="knowledge-file-input"
              />

              <div className={`p-4 rounded-full mb-4 transition-all ${
                uploading ? 'bg-indigo-500/20 text-indigo-500 animate-pulse' : 'bg-muted text-muted-foreground'
              }`}>
                <UploadCloud className="w-8 h-8" />
              </div>

              <h3 className="text-base font-semibold text-foreground mb-1">
                {uploading ? 'Uploading & processing…' : 'Drop a file here, or click to browse'}
              </h3>
              <p className="text-sm text-muted-foreground">
                Accepted: .txt, .md, .csv, .json, .pdf — Max 10 MB
              </p>

              {/* Progress bar */}
              {uploading && (
                <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl overflow-hidden">
                  <motion.div
                    className="h-full bg-indigo-500"
                    initial={{ width: '0%' }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ ease: 'linear', duration: 0.3 }}
                  />
                </div>
              )}
            </div>

            {/* PDF warning banner */}
            {pdfCount > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm"
              >
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-amber-600 dark:text-amber-400 leading-relaxed">
                  <span className="font-semibold">{pdfCount} PDF {pdfCount === 1 ? 'file' : 'files'} uploaded.</span>
                  {' '}Text extraction from PDFs is handled server-side. If a PDF contains only images/scanned content, text may not be available for AI training.
                </p>
              </motion.div>
            )}

            {/* Document list */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight">Uploaded Documents</h3>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">{docs.length}</span>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-[72px] rounded-2xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : docs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center bg-card border border-border/60 rounded-2xl">
                  <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No documents yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Upload your first file to start training the AI</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {docs.map(doc => {
                    const ext = doc.file_type || getFileExtension(doc.filename);
                    const isPdf = ext === 'pdf';
                    const isDeleting = deletingId === doc.id;
                    return (
                      <motion.div
                        key={doc.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: isDeleting ? 0.4 : 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        className="flex items-center gap-4 p-4 bg-card border border-border/80 rounded-2xl hover:border-border transition-colors group"
                      >
                        {/* File icon */}
                        <div className="p-2.5 rounded-xl bg-secondary shrink-0">
                          <FileIcon ext={ext} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{doc.filename}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="w-3 h-3 text-muted-foreground/50" />
                            <span className="text-xs text-muted-foreground">
                              {new Date(doc.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-2 shrink-0">
                          <FileTypeBadge ext={ext} />

                          {isPdf ? (
                            <span className="flex items-center gap-1 text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-1 rounded-md border border-amber-500/20">
                              <AlertCircle className="w-3 h-3" /> Text not extracted
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-medium bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-md border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Trained
                            </span>
                          )}

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(doc)}
                            disabled={isDeleting}
                            className="ml-1 p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            aria-label={`Delete ${doc.filename}`}
                          >
                            {isDeleting
                              ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              : <Trash2 className="w-4 h-4" />
                            }
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Right: Neural Knowledge Graph */}
          <div className="lg:col-span-1">
            <div className="bg-[#080F1E] text-white rounded-2xl p-6 h-full min-h-[420px] flex flex-col relative overflow-hidden border border-[#1E293B] shadow-2xl sticky top-4">
              {/* Ambient glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/20 blur-[80px] rounded-full pointer-events-none" />

              <div className="flex items-center gap-2 mb-6 relative z-10">
                <BrainCircuit className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold tracking-widest uppercase text-emerald-400">Neural Knowledge Graph</span>
              </div>

              {/* Live graph visualization */}
              <div className="flex-1 flex flex-col items-center justify-center relative z-10 gap-6">
                {docs.length > 0 ? (
                  <>
                    {/* Animated brain */}
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.2)]">
                        <div className="absolute inset-0 rounded-full border border-emerald-500/20 animate-[spin_6s_linear_infinite]" />
                        <div className="absolute inset-2 rounded-full border border-emerald-500/10 animate-[spin_4s_linear_infinite_reverse]" />
                        <BrainCircuit className="w-10 h-10 text-emerald-400" />
                      </div>
                      {/* Orbiting dots representing docs */}
                      {docs.slice(0, 4).map((_, i) => (
                        <div
                          key={i}
                          className="absolute w-2.5 h-2.5 rounded-full bg-emerald-500/60 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                          style={{
                            top: '50%', left: '50%',
                            transform: `rotate(${i * 90}deg) translateX(52px) translateY(-50%)`,
                          }}
                        />
                      ))}
                    </div>

                    <div className="text-center space-y-1.5">
                      <p className="font-semibold text-white text-sm">Neural mapping active</p>
                      <p className="text-xs text-slate-400 max-w-[200px] mx-auto leading-relaxed">
                        AI is extracting semantic relationships from {docs.length} document{docs.length !== 1 ? 's' : ''}.
                      </p>
                    </div>

                    {/* Doc type breakdown */}
                    <div className="w-full space-y-2 mt-2">
                      {(['txt', 'md', 'csv', 'json', 'pdf'] as const).map(ext => {
                        const count = docs.filter(d => (d.file_type || getFileExtension(d.filename)) === ext).length;
                        if (count === 0) return null;
                        return (
                          <div key={ext} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                            <span className="text-slate-300 uppercase font-mono font-bold">.{ext}</span>
                            <span className="text-slate-400">{count} file{count > 1 ? 's' : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                      <BrainCircuit className="w-9 h-9 text-slate-500" />
                    </div>
                    <p className="text-sm text-slate-400 text-center max-w-[180px] leading-relaxed">
                      Upload files to build the neural graph and train your AI agent.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
