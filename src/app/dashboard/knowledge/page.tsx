"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, UploadCloud, FileText, Trash2, BrainCircuit, Activity, AlertCircle, FileType, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface KnowledgeDoc {
  id: string;
  filename: string;
  content_text: string;
  created_at: string;
}

export default function KnowledgeBasePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    try {
      const res = await fetch('/api/dashboard/knowledge');
      const data = await res.json();
      if (data.success) {
        setDocs(data.docs || []);
      }
    } catch (error) {
      console.error('Failed to fetch docs', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  const handleUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }
    
    // In a real implementation, we would extract text from PDF/DOCX here or send to backend to extract.
    // Since Windsurf is building the backend, we will just send it to the endpoint.
    
    const formData = new FormData();
    formData.append('file', file);
    
    setUploading(true);
    try {
      const res = await fetch('/api/dashboard/knowledge', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success(`${file.name} uploaded successfully`);
        fetchDocs();
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;
    
    try {
      const res = await fetch(`/api/dashboard/knowledge?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Document deleted');
        setDocs(docs.filter(d => d.id !== id));
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const totalBytes = docs.reduce((acc, doc) => acc + (doc.content_text?.length || 0), 0);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1000px] mx-auto w-full space-y-8">
        
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Upload menus, FAQs, policies, and product details. The AI will read and understand these files to answer customer questions accurately.
          </p>
        </header>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-card border border-border shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center gap-4">
            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Knowledge</p>
              <p className="text-xl font-semibold text-foreground mt-0.5">{totalMB} MB</p>
            </div>
          </div>
          
          <div className="p-5 rounded-2xl bg-card border border-border shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Documents</p>
              <p className="text-xl font-semibold text-foreground mt-0.5">{docs.length}</p>
            </div>
          </div>
          
          <div className="p-5 rounded-2xl bg-card border border-border shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Training Health</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xl font-semibold text-foreground">100%</p>
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded-md">OPTIMAL</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Upload Area */}
          <div className="lg:col-span-2 space-y-6">
            <div 
              className={`relative flex flex-col items-center justify-center p-12 text-center rounded-3xl border-2 border-dashed transition-colors ${
                dragActive ? 'border-indigo-500 bg-indigo-500/5' : 'border-border/60 hover:border-border bg-card'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleChange}
                accept=".txt,.pdf,.csv,.doc,.docx"
                disabled={uploading}
              />
              
              <div className={`p-4 rounded-full mb-4 ${uploading ? 'bg-indigo-500/20 text-indigo-500 animate-pulse' : 'bg-muted text-muted-foreground'}`}>
                <UploadCloud className="w-8 h-8" />
              </div>
              
              <h3 className="text-lg font-semibold text-foreground mb-1">
                {uploading ? 'Uploading & Processing...' : 'Click or drag files to upload'}
              </h3>
              <p className="text-sm text-muted-foreground">
                Supports PDF, DOC, TXT, CSV (Max 10MB)
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold tracking-tight">Knowledge Repository <span className="text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-2 text-xs">{docs.length}</span></h3>
              
              {loading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading documents...</div>
              ) : docs.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground bg-card border border-border/60 rounded-2xl">
                  No documents uploaded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {docs.map(doc => (
                    <motion.div 
                      key={doc.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-4 bg-card border border-border/80 rounded-2xl hover:border-border transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-secondary text-muted-foreground group-hover:text-foreground transition-colors">
                          <FileType className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{doc.filename}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Added {new Date(doc.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium bg-emerald-500/10 px-2 py-1 rounded-md">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Trained
                        </div>
                        <button 
                          onClick={() => handleDelete(doc.id, doc.filename)}
                          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Neural Knowledge Graph Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-[#0B1120] text-white rounded-3xl p-6 h-full min-h-[400px] flex flex-col relative overflow-hidden border border-[#1E293B] shadow-2xl">
              {/* Background Glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-emerald-500/20 blur-[100px] rounded-full pointer-events-none" />
              
              <div className="flex items-center gap-2 mb-8 relative z-10">
                <BrainCircuit className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold tracking-wider uppercase text-emerald-400">Neural Knowledge Graph</h3>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center relative z-10 text-center gap-6">
                {docs.length > 0 ? (
                  <>
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 flex items-center justify-center relative shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                      <div className="absolute inset-0 rounded-full border border-emerald-500/20 animate-[spin_4s_linear_infinite]" />
                      <div className="absolute inset-2 rounded-full border border-emerald-500/10 animate-[spin_3s_linear_infinite_reverse]" />
                      <BrainCircuit className="w-10 h-10 text-emerald-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-white font-medium">Neural mapping active</p>
                      <p className="text-sm text-slate-400 max-w-[200px] mx-auto leading-relaxed">
                        Your AI is actively extracting semantic relationships from {docs.length} document{docs.length === 1 ? '' : 's'}.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                      <BrainCircuit className="w-8 h-8 text-slate-500" />
                    </div>
                    <p className="text-sm text-slate-400 max-w-[200px] mx-auto leading-relaxed">
                      Upload files to build the graph and empower your AI agent.
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
