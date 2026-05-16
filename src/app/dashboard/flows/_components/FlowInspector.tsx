"use client";

import { Settings2, Edit3, X } from "lucide-react";
import { useFlowStore } from "../store";

export default function FlowInspector() {
  const { selectedNodeId, nodes, updateNodeData } = useFlowStore();

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  if (selectedNode) {
    return (
      <div className="w-full flex-shrink-0 bg-transparent flex flex-col z-10 overflow-y-auto">
        <div className="p-6 space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-6 text-white/80">
              <Edit3 className="w-3.5 h-3.5 text-white/50" />
              <h2 className="text-[12px] font-medium tracking-tight">Node Configuration</h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] text-white/40 font-medium tracking-wide">Node Name</label>
                <input 
                  type="text"
                  value={selectedNode.data?.label || ""}
                  onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                  className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                />
              </div>

              {selectedNode.type === 'standard' && (
                <div className="space-y-2">
                  <label className="text-[11px] text-white/40 font-medium tracking-wide">Message Content</label>
                  <textarea 
                    value={selectedNode.data?.content || ""}
                    onChange={(e) => updateNodeData(selectedNode.id, { content: e.target.value })}
                    rows={4}
                    className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02] resize-none"
                  />
                </div>
              )}

              {selectedNode.type === 'interruption' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">User Query Trigger</label>
                    <input 
                      type="text"
                      value={selectedNode.data?.userQuery || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { userQuery: e.target.value })}
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">AI Auto-Response</label>
                    <textarea 
                      value={selectedNode.data?.aiResponse || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { aiResponse: e.target.value })}
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02] resize-none"
                    />
                  </div>
                </>
              )}

              {selectedNode.type === 'condition' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">Variable Field</label>
                    <input 
                      type="text"
                      value={selectedNode.data?.field || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { field: e.target.value })}
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">Operator</label>
                    <select 
                      value={selectedNode.data?.operator || "=="}
                      onChange={(e) => updateNodeData(selectedNode.id, { operator: e.target.value })}
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02] appearance-none"
                    >
                      <option value="==">Equals (==)</option>
                      <option value="!=">Not Equals (!=)</option>
                      <option value=">">Greater Than (&gt;)</option>
                      <option value="<">Less Than (&lt;)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">Target Value</label>
                    <input 
                      type="text"
                      value={selectedNode.data?.value || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { value: e.target.value })}
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                    />
                  </div>
                </>
              )}

              {selectedNode.type === 'webhook' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">Method</label>
                    <select 
                      value={selectedNode.data?.method || "POST"}
                      onChange={(e) => updateNodeData(selectedNode.id, { method: e.target.value })}
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02] appearance-none"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">Endpoint URL</label>
                    <input 
                      type="url"
                      value={selectedNode.data?.url || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { url: e.target.value })}
                      placeholder="https://api..."
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                    />
                  </div>
                </>
              )}

              {selectedNode.type === 'delay' && (
                <div className="space-y-2">
                  <label className="text-[11px] text-white/40 font-medium tracking-wide">Delay Duration (Seconds)</label>
                  <input 
                    type="number"
                    min="1"
                    value={selectedNode.data?.duration || "2"}
                    onChange={(e) => updateNodeData(selectedNode.id, { duration: e.target.value })}
                    className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                  />
                </div>
              )}

              {selectedNode.type === 'handoff' && (
                <div className="space-y-2">
                  <label className="text-[11px] text-white/40 font-medium tracking-wide">Assign to Team</label>
                  <select 
                    value={selectedNode.data?.team || "Support Team"}
                    onChange={(e) => updateNodeData(selectedNode.id, { team: e.target.value })}
                    className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02] appearance-none"
                  >
                    <option value="Support Team">Support Team</option>
                    <option value="Sales Team">Sales Team</option>
                    <option value="Billing Team">Billing Team</option>
                  </select>
                </div>
              )}

              {selectedNode.type === 'knowledge' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-white/40 tracking-wide uppercase">Knowledge Source</label>
                  <select 
                    value={selectedNode.data?.source || "Help Center Docs"}
                    onChange={(e) => updateNodeData(selectedNode.id, { source: e.target.value })}
                    className="w-full bg-[#111] border border-white/10 rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                  >
                    <option value="Help Center Docs">Help Center Docs</option>
                    <option value="Pricing Policies">Pricing Policies</option>
                    <option value="Internal Knowledge Base">Internal Knowledge Base</option>
                  </select>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default Global Inspector
  return (
    <div className="w-full flex-shrink-0 bg-transparent flex flex-col z-10 overflow-y-auto">
      <div className="p-6 space-y-10">
        
        <div>
          <div className="flex items-center gap-2 mb-6 text-white/80">
            <Settings2 className="w-3.5 h-3.5 text-white/50" />
            <h2 className="text-[12px] font-medium tracking-tight">Global Inspector</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-white/40">State</span>
              <span className="text-[12px] text-emerald-500 font-medium">Ready</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-white/40">Active Flow</span>
              <span className="text-[12px] text-white/80 font-medium tracking-tight">Qualification</span>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-white/5" />

        <div>
          <h3 className="text-[10px] font-bold tracking-widest text-white/30 uppercase mb-5">AI Metrics</h3>
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-white/40">Conv. Fluidity</span>
              <span className="text-[12px] text-white/90 font-medium">94%</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-white/40">Recovery Rate</span>
              <span className="text-[12px] text-white/90 font-medium">99%</span>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-white/5" />

        <div>
          <h3 className="text-[10px] font-bold tracking-widest text-white/30 uppercase mb-5">Variables</h3>
          <div className="space-y-5">
            <div>
              <div className="text-[10px] text-white/40 mb-1 tracking-wide uppercase">Business Type</div>
              <div className="text-[13px] text-white/90 font-medium">Clinic</div>
            </div>
            <div>
              <div className="text-[10px] text-white/40 mb-1 tracking-wide uppercase">Team Size</div>
              <div className="text-[13px] text-white/30 italic">Awaiting input...</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
