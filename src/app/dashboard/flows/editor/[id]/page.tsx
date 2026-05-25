"use client";

import { Play, X, ArrowLeft, Check, Loader2 } from "lucide-react";
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
  const { selectedNodeId, isSimulating, setIsSimulating, isPublishing, isSaving, publishFlow, loadTemplate, loadFlow, saveFlow, flowId: storeFlowId } = useFlowStore();
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
      // Load existing flow from DB
      loadFlow(routeId);
    } else {
      // Fresh editor — load prebuilt template if applicable
      const isBlank = businessType === 'blank' && !templateId;
      if (!isBlank) {
        const { nodes, edges } = getPrebuiltFlow(templateId || businessType, businessType);
        loadTemplate(nodes, edges);
      } else {
        loadTemplate([], []);
      }
    }
  }, [routeId, businessType, templateId, loadTemplate, loadFlow]);

  return (
    <>
      <Toaster theme="dark" position="bottom-center" />
      <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100vh-64px)] lg:h-screen flex flex-col overflow-hidden bg-[#030303] text-white selection:bg-emerald-500/30 animate-in fade-in duration-300">
        
        {/* Top Bar */}
        <header className="h-[52px] flex-shrink-0 border-b border-[rgba(255,255,255,0.08)] bg-[#0A0A0A] flex items-center justify-between px-4 z-20">
          <div className="flex items-center gap-2 text-[13px]">
            <Link 
              href={businessType !== 'blank' ? `/dashboard/flows/templates/${businessType}` : `/dashboard/flows`}
              className="p-1.5 -ml-1.5 rounded-md hover:bg-white/5 text-gray-400 hover:text-white transition-colors mr-1"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            
            <Link href="/dashboard/flows" className="text-gray-400 hover:text-white transition-colors">
              Flows
            </Link>
            <span className="text-gray-500">/</span>
            <Link href={businessType !== 'blank' ? `/dashboard/flows/templates/${businessType}` : `/dashboard/flows`} className="text-gray-400 hover:text-white transition-colors">
              {config.name}
            </Link>
            <span className="text-gray-500">/</span>
            <input
              value={flowName}
              onChange={e => setFlowName(e.target.value)}
              className="bg-transparent text-white font-medium text-[13px] focus:outline-none border-b border-transparent focus:border-white/20 transition-colors px-1"
              placeholder="Untitled Flow"
            />
          </div>

          <div className="flex items-center gap-4">
            {!isSaving && (
              <span className="text-green-400 text-sm flex items-center gap-1.5">
                Saved <Check className="w-3.5 h-3.5" />
              </span>
            )}
            {isSaving && (
              <span className="text-gray-400 text-sm">Saving...</span>
            )}

            <button 
              onClick={() => {
                if (isSimulating) {
                  setIsSimulating(false);
                  useFlowStore.getState().setSelectedNodeId(null);
                } else {
                  setIsSimulating(true);
                }
              }}
              className="h-8 px-3 rounded-md hover:bg-[rgba(255,255,255,0.05)] text-[13px] font-medium text-white transition-colors flex items-center gap-2"
            >
              {isSimulating ? <><X className="w-4 h-4" /> Exit Simulation</> : <><Play className="w-4 h-4" /> Simulate</>}
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="h-8 px-3 rounded-md border border-white/10 hover:bg-white/5 text-[13px] font-medium text-white/80 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button 
              onClick={handlePublish}
              disabled={isPublishing}
              className="h-8 px-4 rounded-md bg-[#12B76A] text-white hover:bg-[#0E9055] text-[13px] font-medium transition-colors disabled:opacity-70 flex items-center gap-1.5"
            >
              {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isPublishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden relative">
          {!isSimulating && <FlowSidebar businessType={businessType} />}
          {isSimulating && <FlowSimulator />}
          <FlowCanvas />
          {!isSimulating && selectedNodeId && (
            <div className="w-[300px] flex-shrink-0 bg-[#0A0A0A] border-l border-[rgba(255,255,255,0.08)] z-10 shadow-[-4px_0_24px_rgba(0,0,0,0.5)] overflow-hidden">
              <FlowInspector />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
