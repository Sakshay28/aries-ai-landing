"use client";

import { Play, X, ArrowLeft, Check, Loader2 } from "lucide-react";
import FlowSidebar from "../../_components/FlowSidebar";
import FlowCanvas from "../../_components/FlowCanvas";
import FlowInspector from "../../_components/FlowInspector";
import FlowSimulator from "../../_components/FlowSimulator";
import { ReactFlowProvider } from "@xyflow/react";
import { useFlowStore } from "../../store";
import { Toaster, toast } from "sonner";
import { useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { BUSINESS_TYPE_CONFIG } from "../../config";
import { getPrebuiltFlow } from "../../prebuiltFlows";

export default function FlowEditorPage() {
  const { selectedNodeId, isSimulating, setIsSimulating, isPublishing, isSaving, publishFlow, loadTemplate } = useFlowStore();
  const params = useParams();
  const searchParams = useSearchParams();
  const flowId = params.id as string;
  const businessType = searchParams?.get('type') || 'blank';
  
  const config = BUSINESS_TYPE_CONFIG[businessType] || BUSINESS_TYPE_CONFIG['blank'];

  const handlePublish = async () => {
    await publishFlow();
    toast.success("Flow published successfully", {
      description: "Changes are now live across all channels.",
    });
  };

  useEffect(() => {
    // Load prebuilt flow on mount based on template/business type
    // In a real app, you would fetch by flowId, but for now we generate based on the template
    const isBlank = flowId === 'new' && businessType === 'blank';
    if (!isBlank) {
      const { nodes, edges } = getPrebuiltFlow(flowId, businessType);
      loadTemplate(nodes, edges);
    } else {
      loadTemplate([], []);
    }
  }, [flowId, businessType, loadTemplate]);

  return (
    <ReactFlowProvider>
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
            <span className="text-white font-medium">{flowId === 'new' ? 'Draft' : flowId}</span>
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
    </ReactFlowProvider>
  );
}
