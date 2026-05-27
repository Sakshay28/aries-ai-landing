"use client";

import { Play, X, ArrowLeft, Check, Loader2, Undo2, Redo2, AlertTriangle, CheckCircle2, XCircle, History, Smartphone } from "lucide-react";
import FlowSidebar from "../../_components/FlowSidebar";
import FlowCanvas from "../../_components/FlowCanvas";
import FlowInspector from "../../_components/FlowInspector";
import FlowSimulator from "../../_components/FlowSimulator";
import FlowVersionPanel from "../../_components/FlowVersionPanel";
import WhatsAppPreview from "../../_components/WhatsAppPreview";
import { useFlowStore } from "../../store";
import { Toaster, toast } from "sonner";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { BUSINESS_TYPE_CONFIG } from "../../config";
import { getPrebuiltFlow } from "../../prebuiltFlows";
import { validateFlow, type FlowHealthReport } from "../../utils";

export default function FlowEditorPage() {
  const { selectedNodeId, isSimulating, setIsSimulating, isPublishing, isSaving, publishFlow, loadTemplate, loadFlow, saveFlow, undo, redo, history, nodes } = useFlowStore();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeId = params.id as string;
  const businessType = searchParams?.get('type') || 'blank';
  const templateId = searchParams?.get('template') || null;
  const [flowName, setFlowName] = useState('Untitled Flow');

  const config = BUSINESS_TYPE_CONFIG[businessType] || BUSINESS_TYPE_CONFIG['blank'];

  const [healthReport, setHealthReport] = useState<FlowHealthReport | null>(null);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const runValidation = useCallback(() => {
    const { nodes, edges } = useFlowStore.getState();
    return validateFlow(nodes, edges);
  }, []);

  const handlePublish = async () => {
    const report = runValidation();
    setHealthReport(report);
    if (!report.canPublish) {
      setShowHealthModal(true);
      toast.error(`Cannot publish: ${report.criticalCount} critical error${report.criticalCount > 1 ? 's' : ''}`);
      return;
    }
    if (report.warningCount > 0) {
      setShowHealthModal(true);
      return;
    }
    await doPublish();
  };

  const doPublish = async () => {
    setShowHealthModal(false);
    try {
      await publishFlow();
      const id = useFlowStore.getState().flowId;
      if (id && routeId === 'new') {
        router.replace(`/dashboard/flows/editor/${id}?type=${businessType}`);
      }
      // Snapshot version after publish
      if (id) {
        fetch(`/api/dashboard/flows/${id}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {});
      }
      toast.success('Flow published: now live', {
        description: 'Incoming WhatsApp messages will trigger this flow.',
      });
    } catch {
      toast.error('Failed to publish flow');
    }
  };

  // Derive selected node data for WhatsApp preview
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const previewNodeType = selectedNode?.type ?? 'standard';
  const previewNodeData = (selectedNode?.data ?? {}) as Record<string, unknown>;

  const handleSave = async () => {
    const id = await saveFlow(flowName);
    if (id && routeId === 'new') {
      router.replace(`/dashboard/flows/editor/${id}?type=${businessType}`);
    }
    toast.success('Flow saved');
  };

  useEffect(() => {
    if (routeId !== 'new') {
      loadFlow(routeId);
    } else {
      const isBlank = businessType === 'blank' && !templateId;
      if (!isBlank) {
        const { nodes, edges } = getPrebuiltFlow(templateId || businessType, businessType);
        loadTemplate(nodes, edges);
      } else {
        loadTemplate([], []);
      }
    }
  }, [routeId, businessType, templateId, loadTemplate, loadFlow]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return (
    <>
      <Toaster theme="dark" position="bottom-center" />
      <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100vh-64px)] lg:h-screen flex flex-col overflow-hidden text-white" style={{ background: '#06070a' }}>

        {/* Header — 56px */}
        <header
          className="h-14 flex-shrink-0 flex items-center justify-between px-5 z-20"
          style={{
            background: 'rgba(13,17,23,0.92)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {/* Left: Breadcrumb + Flow name */}
          <div className="flex items-center gap-2.5 text-[13px]">
            <Link
              href={businessType !== 'blank' ? `/dashboard/flows/templates/${businessType}` : `/dashboard/flows`}
              className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/[0.06] transition-colors mr-1"
            >
              <ArrowLeft className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.35)' }} />
            </Link>

            <Link href="/dashboard/flows" className="text-[12px] transition-colors hover:text-white/60" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Flows
            </Link>
            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.12)' }}>/</span>
            <Link href={businessType !== 'blank' ? `/dashboard/flows/templates/${businessType}` : `/dashboard/flows`} className="text-[12px] transition-colors hover:text-white/60" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {config.name}
            </Link>
            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.12)' }}>/</span>
            <input
              value={flowName}
              onChange={e => setFlowName(e.target.value)}
              className="bg-transparent font-semibold text-[13.5px] focus:outline-none transition-colors px-0.5 min-w-[110px]"
              style={{ color: 'rgba(255,255,255,0.88)', borderBottom: '1px solid transparent' }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderBottomColor = 'rgba(255,255,255,0.18)'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderBottomColor = 'transparent'; }}
              placeholder="Untitled Flow"
            />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Undo / Redo */}
            <div className="flex items-center rounded-lg overflow-hidden mr-2" style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}>
              <button
                onClick={undo}
                disabled={!canUndo}
                title="Undo (⌘Z)"
                className="px-2.5 py-1.5 transition-all disabled:opacity-20 hover:bg-white/[0.06]"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.07)' }} />
              <button
                onClick={redo}
                disabled={!canRedo}
                title="Redo (⌘⇧Z)"
                className="px-2.5 py-1.5 transition-all disabled:opacity-20 hover:bg-white/[0.06]"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Save status */}
            <div className="mr-2">
              {isSaving ? (
                <span className="text-[12px] flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving
                </span>
              ) : (
                <span className="text-[12px] flex items-center gap-1.5 text-emerald-400/80">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
            </div>

            {/* Preview toggle */}
            {!isSimulating && (
              <button
                onClick={() => setShowPreview(v => !v)}
                title="WhatsApp Preview"
                className="h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-all"
                style={{
                  background: showPreview ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
                  color: showPreview ? '#4ade80' : 'rgba(255,255,255,0.45)',
                  border: `1px solid ${showPreview ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Versions */}
            {routeId !== 'new' && !isSimulating && (
              <button
                onClick={() => setShowVersions(true)}
                title="Version History"
                className="h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-all"
                style={{
                  background: 'rgba(168,85,247,0.08)',
                  color: 'rgba(192,132,252,0.85)',
                  border: '1px solid rgba(168,85,247,0.15)',
                }}
              >
                <History className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Simulate */}
            <button
              onClick={() => {
                if (isSimulating) {
                  setIsSimulating(false);
                  useFlowStore.getState().setSelectedNodeId(null);
                } else {
                  setIsSimulating(true);
                  setShowPreview(false);
                }
              }}
              className="h-8 px-3.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-all"
              style={{
                background: isSimulating ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
                color: isSimulating ? '#f87171' : 'rgba(255,255,255,0.6)',
                border: `1px solid ${isSimulating ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)'}`,
              }}
            >
              {isSimulating ? <><X className="w-3.5 h-3.5" /> Exit</> : <><Play className="w-3.5 h-3.5" /> Simulate</>}
            </button>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="h-8 px-3.5 rounded-lg text-[12px] font-medium transition-all disabled:opacity-40"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.65)',
              }}
            >
              Save
            </button>

            {/* Publish */}
            <button
              onClick={handlePublish}
              disabled={isPublishing}
              className="h-8 px-4 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: '#fff',
                boxShadow: '0 1px 12px rgba(34,197,94,0.25)',
              }}
            >
              {isPublishing && <Loader2 className="w-3 h-3 animate-spin" />}
              {isPublishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </header>

        {/* Health Report Modal */}
        {showHealthModal && healthReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <div className="w-[480px] max-h-[80vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: '#0D1117', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-3">
                  {healthReport.canPublish
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    : <XCircle className="w-5 h-5 text-red-400" />
                  }
                  <div>
                    <h3 className="text-[14px] font-semibold text-white">Flow Health Report</h3>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {healthReport.criticalCount} error{healthReport.criticalCount !== 1 ? 's' : ''} · {healthReport.warningCount} warning{healthReport.warningCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowHealthModal(false)} className="p-1.5 rounded-lg hover:bg-white/[0.06]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                {healthReport.issues.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl" style={{
                    background: item.issue.severity === 'error' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
                    border: `1px solid ${item.issue.severity === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)'}`,
                  }}>
                    {item.issue.severity === 'error'
                      ? <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-red-400" />
                      : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-400" />
                    }
                    <div>
                      <p className="text-[12px] font-medium" style={{ color: item.issue.severity === 'error' ? '#f87171' : '#fbbf24' }}>{item.issue.message}</p>
                      {item.nodeLabel && (
                        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                          Node: {item.nodeLabel}{item.nodeType ? ` (${item.nodeType})` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button onClick={() => setShowHealthModal(false)} className="h-8 px-4 rounded-lg text-[12px] font-medium" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Fix Issues
                </button>
                {healthReport.canPublish && (
                  <button onClick={doPublish} className="h-8 px-4 rounded-lg text-[12px] font-semibold text-white" style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', boxShadow: '0 1px 12px rgba(34,197,94,0.25)' }}>
                    Publish Anyway ({healthReport.warningCount} warning{healthReport.warningCount !== 1 ? 's' : ''})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main */}
        <div className="flex-1 flex overflow-hidden relative">
          {!isSimulating && <FlowSidebar businessType={businessType} />}
          {isSimulating && <FlowSimulator />}
          <FlowCanvas />

          {/* WhatsApp Preview Panel */}
          {showPreview && !isSimulating && (
            <div
              className="w-[280px] flex-shrink-0 z-10 flex flex-col overflow-hidden"
              style={{
                background: '#0B1418',
                borderLeft: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '-8px 0 24px rgba(0,0,0,0.4)',
              }}
            >
              <div className="flex-shrink-0 px-3 py-2.5 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-3.5 h-3.5" style={{ color: '#4ade80' }} />
                  <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>WhatsApp Preview</span>
                </div>
                <button onClick={() => setShowPreview(false)} className="p-1 rounded hover:bg-white/[0.06]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <WhatsAppPreview nodeType={previewNodeType} nodeData={previewNodeData} />
              </div>
            </div>
          )}

          {!isSimulating && (
            <div
              className="w-[360px] flex-shrink-0 z-10 overflow-hidden"
              style={{
                background: 'rgba(13,17,23,0.9)',
                backdropFilter: 'blur(20px)',
                borderLeft: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
                transform: selectedNodeId ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.18s cubic-bezier(0.16,1,0.3,1)',
                position: selectedNodeId ? 'relative' : 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
              }}
            >
              <FlowInspector />
            </div>
          )}
        </div>
      </div>

      {/* Version History Modal */}
      {showVersions && routeId !== 'new' && (
        <FlowVersionPanel
          flowId={routeId}
          onClose={() => setShowVersions(false)}
          onRestored={() => { loadFlow(routeId); }}
        />
      )}
    </>
  );
}
