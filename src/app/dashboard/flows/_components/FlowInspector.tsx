"use client";

import { Settings2, Edit3, Tag } from "lucide-react";
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
                  value={(selectedNode.data?.label as string) || ""}
                  onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                  className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                />
              </div>

              {(selectedNode.type === 'trigger' || selectedNode.type === 'keyword_trigger') && (
                <>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">Trigger Type</label>
                    <select
                      value={(selectedNode.data?.triggerType as string) || 'keyword'}
                      onChange={e => updateNodeData(selectedNode.id, { triggerType: e.target.value })}
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02] appearance-none"
                    >
                      <option value="keyword">Keyword Match</option>
                      <option value="first_message">First Message (any)</option>
                      <option value="all_messages">All Messages</option>
                    </select>
                  </div>
                  {((selectedNode.data?.triggerType as string) || 'keyword') === 'keyword' && (
                    <div className="space-y-2">
                      <label className="text-[11px] text-white/40 font-medium tracking-wide flex items-center gap-1.5">
                        <Tag className="w-3 h-3" /> Keywords <span className="text-white/20">(comma-separated)</span>
                      </label>
                      <input
                        type="text"
                        value={(selectedNode.data?.keywords as string) || ''}
                        onChange={e => updateNodeData(selectedNode.id, { keywords: e.target.value })}
                        placeholder="book, appointment, price, help"
                        className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                      />
                      <p className="text-[10px] text-white/25 leading-relaxed">Flow activates when any of these words appear in the incoming message.</p>
                    </div>
                  )}
                </>
              )}

              {selectedNode.type === 'standard' && (
                <div className="space-y-2">
                  <label className="text-[11px] text-white/40 font-medium tracking-wide">Message Content</label>
                  <textarea 
                    value={(selectedNode.data?.content as string) || ""}
                    onChange={(e) => updateNodeData(selectedNode.id, { content: e.target.value })}
                    rows={4}
                    className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02] resize-none"
                  />
                </div>
              )}

              {(selectedNode.type === 'send_media' || selectedNode.type === 'send_audio') && (
                <>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">Media Type</label>
                    <select
                      value={(selectedNode.data?.mediaType as string) || (selectedNode.type === 'send_audio' ? 'audio' : 'image')}
                      onChange={e => updateNodeData(selectedNode.id, { mediaType: e.target.value })}
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02] appearance-none"
                    >
                      <option value="image">Image (JPG / PNG / WebP)</option>
                      <option value="video">Video (MP4)</option>
                      <option value="audio">Audio (MP3 / OGG)</option>
                      <option value="file">File / Document (PDF etc.)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">Media URL</label>
                    <input
                      type="url"
                      value={(selectedNode.data?.mediaUrl as string) || ''}
                      onChange={e => updateNodeData(selectedNode.id, { mediaUrl: e.target.value })}
                      placeholder="https://cdn.example.com/image.jpg"
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                    />
                    <p className="text-[10px] text-white/25 leading-relaxed">Publicly accessible URL. Supports {'{{variable}}'}-style interpolation.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">Caption <span className="text-white/20">(optional)</span></label>
                    <input
                      type="text"
                      value={(selectedNode.data?.caption as string) || ''}
                      onChange={e => updateNodeData(selectedNode.id, { caption: e.target.value })}
                      placeholder="Add a caption for this media..."
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                    />
                  </div>
                </>
              )}

              {selectedNode.type === 'interruption' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">User Query Trigger</label>
                    <input 
                      type="text"
                      value={(selectedNode.data?.userQuery as string) || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { userQuery: e.target.value })}
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">AI Auto-Response</label>
                    <textarea 
                      value={(selectedNode.data?.aiResponse as string) || ""}
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
                      value={(selectedNode.data?.field as string) || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { field: e.target.value })}
                      className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-white/40 font-medium tracking-wide">Operator</label>
                    <select 
                      value={(selectedNode.data?.operator as string) || "=="}
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
                      value={(selectedNode.data?.value as string) || ""}
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
                      value={(selectedNode.data?.method as string) || "POST"}
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
                      value={(selectedNode.data?.url as string) || ""}
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
                    value={(selectedNode.data?.duration as string) || "2"}
                    onChange={(e) => updateNodeData(selectedNode.id, { duration: e.target.value })}
                    className="w-full bg-[#111] border border-transparent rounded-md px-3 py-2.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/10 focus:bg-white/5 transition-all hover:bg-white/[0.02]"
                  />
                </div>
              )}

              {selectedNode.type === 'handoff' && (
                <div className="space-y-2">
                  <label className="text-[11px] text-white/40 font-medium tracking-wide">Assign to Team</label>
                  <select 
                    value={(selectedNode.data?.team as string) || "Support Team"}
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
                    value={(selectedNode.data?.source as string) || "Help Center Docs"}
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
            <h2 className="text-[12px] font-medium tracking-tight">Flow Inspector</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-white/40">Nodes</span>
              <span className="text-[12px] text-white/80 font-medium">{nodes.length}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-white/40">Status</span>
              <span className="text-[12px] text-emerald-500 font-medium">Ready</span>
            </div>
          </div>
        </div>
        <div className="h-px w-full bg-white/5" />
        <div>
          <p className="text-[11px] text-white/25 leading-relaxed">
            Click any node on the canvas to configure it. Set trigger keywords on the trigger node so the flow activates on the right messages.
          </p>
        </div>

      </div>
    </div>
  );
}
