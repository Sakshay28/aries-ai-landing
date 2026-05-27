"use client";

// ═══════════════════════════════════════════════════════════
// 📜 Flow Version History Panel
// ═══════════════════════════════════════════════════════════
// Shows version list, supports restore + diff view.
// Opened via "Versions" button in editor header.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { History, RotateCcw, Loader2, X, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

interface FlowVersion {
  id: string;
  version: number;
  label: string;
  created_at: string;
  published_by?: string;
}

interface Props {
  flowId: string;
  onClose: () => void;
  onRestored?: () => void;
}

export default function FlowVersionPanel({ flowId, onClose, onRestored }: Props) {
  const [versions, setVersions] = useState<FlowVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!flowId || flowId === 'new') return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/flows/${flowId}/versions`);
      const json = await res.json();
      if (json.success) setVersions(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [flowId]);

  useEffect(() => { load(); }, [load]);

  const handleRestore = async (versionId: string, versionNum: number) => {
    if (!confirm(`Restore flow to v${versionNum}? Current state will become a new version.`)) return;
    setRestoring(versionId);
    try {
      const res = await fetch(`/api/dashboard/flows/${flowId}/versions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Flow restored to v${versionNum}`);
        onRestored?.();
        onClose();
      } else {
        toast.error(json.error || 'Restore failed');
      }
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="w-[440px] max-h-[70vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: '#0D1117', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <History className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white">Version History</h3>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{versions.length} saved version{versions.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors" style={{ color: 'rgba(255,255,255,0.35)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Versions list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
            </div>
          )}
          {!loading && versions.length === 0 && (
            <div className="text-center py-10">
              <History className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.15)' }} />
              <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>No versions yet</p>
              <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.18)' }}>Publish your flow to create the first snapshot</p>
            </div>
          )}
          {versions.map((ver, idx) => (
            <div
              key={ver.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{
                background: idx === 0 ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${idx === 0 ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.05)'}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold" style={{ background: idx === 0 ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.06)', color: idx === 0 ? '#c084fc' : 'rgba(255,255,255,0.45)' }}>
                  v{ver.version}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-white">{ver.label || `Version ${ver.version}`}</span>
                    {idx === 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>LATEST</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {new Date(ver.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              {idx > 0 && (
                <button
                  onClick={() => handleRestore(ver.id, ver.version)}
                  disabled={restoring === ver.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:scale-105"
                  style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', color: '#c084fc' }}
                >
                  {restoring === ver.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  Restore
                </button>
              )}
              {idx === 0 && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] text-center" style={{ color: 'rgba(255,255,255,0.2)' }}>
            A snapshot is saved automatically each time you publish
          </p>
        </div>
      </div>
    </div>
  );
}
