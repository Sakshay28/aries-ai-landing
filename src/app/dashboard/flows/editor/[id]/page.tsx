"use client";

import { Play, X, ArrowLeft, Check, Loader2, Undo2, Redo2 } from "lucide-react";
import FlowSidebar from "../../_components/FlowSidebar";
import FlowCanvas from "../../_components/FlowCanvas";
import FlowInspector from "../../_components/FlowInspector";
import FlowSimulator from "../../_components/FlowSimulator";
import { useFlowStore } from "../../store";
import { Toaster, toast } from "sonner";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { BUSINESS_TYPE_CONFIG } from "../../config";
import { getPrebuiltFlow } from "../../prebuiltFlows";

export default function FlowEditorPage() {
  const { selectedNodeId, isSimulating, setIsSimulating, isPublishing, isSaving, publishFlow, loadTemplate, loadFlow, saveFlow, undo, redo, history } = useFlowStore();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeId = params.id as string;
  const businessType = searchParams?.get('type') || 'blank';
  const templateId = searchParams?.get('template') || null;
  const [flowName, setFlowName] = useState('Untitled Flow');

  const config = BUSINESS_TYPE_CONFIG[businessType] || BUSINESS_TYPE_CONFIG['blank'];

  const handlePublish = async () => {
    try {
      await publishFlow();
      const id = useFlowStore.getState().flowId;
      if (id && routeId === 'new') {
        router.replace(`/dashboard/flows/editor/${id}?type=${businessType}`);
      }
      toast.success('Flow published: now live', {
        description: 'Incoming WhatsApp messages will trigger this flow.',
      });
    } catch {
      toast.error('Failed to publish flow');
    }
  };

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

            {/* Simulate */}
            <button
              onClick={() => {
                if (isSimulating) {
                  setIsSimulating(false);
                  useFlowStore.getState().setSelectedNodeId(null);
                } else {
                  setIsSimulating(true);
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

        {/* Main */}
        <div className="flex-1 flex overflow-hidden relative">
          {!isSimulating && <FlowSidebar businessType={businessType} />}
          {isSimulating && <FlowSimulator />}
          <FlowCanvas />
          {!isSimulating && selectedNodeId && (
            <div
              className="w-[360px] flex-shrink-0 z-10 overflow-hidden"
              style={{
                background: 'rgba(13,17,23,0.9)',
                backdropFilter: 'blur(20px)',
                borderLeft: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
              }}
            >
              <FlowInspector />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
