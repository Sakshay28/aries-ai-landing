"use client";

import { useState } from "react";
import { Handle, Position, NodeToolbar, useReactFlow } from "@xyflow/react";
import { Sparkles, MessageSquare, CornerDownRight, Zap, SplitSquareVertical, Webhook, Trash2, Copy, Plus, Clock, UserIcon, BookOpen, CircleStop, Database, PlayCircle, Braces, Paintbrush, Hourglass, FileText, Pen, HelpCircle } from "lucide-react";

import { useFlowStore } from "../store";
const targetHandleStyle = "!w-3 !h-3 !bg-[#111] !border-2 !border-white/20 hover:!border-[#06B6D4] hover:!bg-[#06B6D4]/20 hover:!scale-125 transition-all duration-300 !opacity-100 !rounded-full !z-50 shadow-sm";
const sourceHandleStyle = "!w-3 !h-3 !bg-[#111] !border-2 !border-white/20 hover:!border-[#06B6D4] hover:!bg-[#06B6D4]/20 hover:!scale-125 transition-all duration-300 !opacity-100 !rounded-full !z-50 shadow-sm !cursor-crosshair";

function NodeActions({ id }: { id: string }) {
  const { setNodes, setEdges } = useReactFlow();
  
  const onDelete = () => {
    setNodes((nodes) => nodes.filter((n) => n.id !== id));
    setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
  };

  const onEdit = () => {
    useFlowStore.getState().setSelectedNodeId(id);
  };

  return (
    <NodeToolbar isVisible position={Position.Top} className="flex items-center gap-1 bg-[#1A1A1A] border border-white/10 p-1 rounded-md shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={onEdit} className="p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors" title="Edit">
        <Pen className="w-3 h-3" />
      </button>
      <button className="p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors" title="Duplicate">
        <Copy className="w-3 h-3" />
      </button>
      <button onClick={onDelete} className="p-1.5 hover:bg-red-500/20 rounded text-white/50 hover:text-red-400 transition-colors" title="Delete">
        <Trash2 className="w-3 h-3" />
      </button>
    </NodeToolbar>
  );
}

export function StandardNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  const isValid = !!data.content;
  const borderClass = isValid 
    ? (selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02] shadow-xl' : 'border border-white/5')
    : 'border border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.1)]';

  return (
    <div className={`w-[280px] rounded-[16px] bg-[#0A0A0A] shadow-2xl overflow-visible relative group transition-all duration-300 ${borderClass}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={targetHandleStyle} />
      
      {/* Documentation Tooltip & Status Badge */}
      <div className="absolute -top-3 right-3 flex items-center gap-1.5">
        {!isValid && (
          <div className="bg-red-500/20 text-red-400 border border-red-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest backdrop-blur-md">
            Error
          </div>
        )}
        <div className="bg-[#111] border border-white/10 text-white/50 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest">
          Active
        </div>
        <div className="group/tooltip relative">
          <HelpCircle className="w-3 h-3 text-white/20 hover:text-white/60 cursor-help transition-colors" />
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-2 bg-[#1A1A1A] border border-white/10 rounded-lg text-[11px] text-white/70 opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50">
            Sends a static text message to the user.
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-3.5 h-3.5 text-white/40" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/50">{data.label}</div>
        </div>
        <div className="text-[13px] text-white/90 leading-relaxed font-medium tracking-tight">
          {data.content || <span className="text-red-400/50 italic">Missing content</span>}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className={sourceHandleStyle} />
      
      {/* First-time helper text */}
      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-500 text-[9px] uppercase tracking-widest font-bold text-white/30 pointer-events-none whitespace-nowrap">
        Drag to connect
      </div>
    </div>
  );
}

export function AIInterruptionNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[340px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      
      <div className="px-5 py-4 relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-white/50" />
          <div className="flex-1">
            <div className="font-semibold text-[13px] text-white/90 tracking-tight">{data.label}</div>
            <div className="flex justify-between items-center mt-0.5">
              <span className="text-[9px] font-medium text-white/40 uppercase tracking-widest">Handled by AI</span>
              <span className="text-[9px] font-bold text-red-400/80 uppercase tracking-widest">Fallback &lt; {data.threshold || "70"}%</span>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/30 mb-1.5 font-semibold">User Query</div>
            <div className="bg-[#030303] rounded-lg p-2.5 border border-white/5 text-[12px] text-white/50 italic relative">
              "{data.userQuery}"
            </div>
          </div>
          
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/30 mb-1.5 font-semibold flex items-center gap-1.5">
              <CornerDownRight className="w-3 h-3" /> Auto-Response
            </div>
            <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 text-[12px] text-white/70 leading-relaxed relative overflow-hidden">
              {data.aiResponse}
            </div>
          </div>
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} id="success" className={`${sourceHandleStyle} !bg-[#0A0A0A]`} style={{ left: '25%' }} />
      <Handle type="source" position={Position.Bottom} id="fallback" className={`${sourceHandleStyle} !border-red-500/40 !bg-[#0A0A0A]`} style={{ left: '75%' }} />
    </div>
  );
}

export function ResumeNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[240px] flex items-center gap-3 p-3 transition-all duration-300 relative group ${selected ? 'opacity-100 scale-[1.02]' : 'opacity-60'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      
      <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10">
        <Zap className="w-3 h-3 text-white/40" />
      </div>
      <div>
        <div className="text-[12px] font-medium text-white/80">{data.label || "Return to Flow"}</div>
        <div className="text-[10px] text-white/40">Resumes main path</div>
      </div>

      <Handle type="source" position={Position.Bottom} className={`${sourceHandleStyle}`} />

    </div>
  );
}

export function LogicNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[260px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <SplitSquareVertical className="w-3.5 h-3.5 text-white/50" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/80">Logic Branch</div>
        </div>
        <div className="p-2 rounded bg-white/5 border border-white/10 flex flex-col gap-1">
          <div className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Condition</div>
          <div className="text-[12px] text-white/90 font-medium tracking-tight font-mono">
            {data.field || "intent"} <span className="text-white/60">{data.operator || "=="}</span> "{data.value || "buy_plan"}"
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="true" className={`${sourceHandleStyle} !bg-[#0A0A0A]`} style={{ left: '25%' }} />
      <Handle type="source" position={Position.Bottom} id="false" className={`${sourceHandleStyle} !border-red-500/40 !bg-[#0A0A0A]`} style={{ left: '75%' }} />
    </div>
  );
}

export function WebhookNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[260px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Webhook className="w-3.5 h-3.5 text-white/50" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/80">API Request</div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/60 text-[10px] font-bold tracking-widest uppercase border border-white/10">
            {data.method || "POST"}
          </span>
          <span className="text-[12px] text-white/60 truncate">{data.url || "https://api.example.com"}</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="success" className={`${sourceHandleStyle} !bg-[#0A0A0A]`} style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="error" className={`${sourceHandleStyle} !border-red-500/40 !bg-[#0A0A0A]`} style={{ left: '70%' }} />

    </div>
  );
}

// --- NEW NODES ---

export function DelayNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[200px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-white/50" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/80">Delay</div>
        </div>
        <div className="text-[12px] text-white/90 font-medium">{data.duration || "2"}s</div>
      </div>
      <Handle type="source" position={Position.Bottom} className={`${sourceHandleStyle}`} />

    </div>
  );
}

export function HandoffNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[240px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-1">
          <UserIcon className="w-3.5 h-3.5 text-white/50" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/80">Human Handoff</div>
        </div>
        <div className="text-[12px] text-white/50">{data.team || "Support Team"}</div>
      </div>
      {/* No source handle, this is an end point usually, or maybe it just pauses */}
      <Handle type="source" position={Position.Bottom} className={`${sourceHandleStyle}`} />
    </div>
  );
}

export function KnowledgeNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[260px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-3.5 h-3.5 text-white/50" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/80">AI Knowledge</div>
        </div>
        <div className="p-2 rounded bg-white/5 border border-white/10 text-[12px] text-white/80">
          Source: <span className="font-semibold text-white/90">{data.source || "Help Center"}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className={`${sourceHandleStyle}`} />

    </div>
  );
}

export function EndNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[200px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      <div className="px-4 py-3 flex items-center justify-center gap-2">
        <CircleStop className="w-3.5 h-3.5 text-white/40" />
        <div className="font-semibold text-[11px] uppercase tracking-widest text-white/60">End Flow</div>
      </div>
    </div>
  );
}

export function TriggerNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[220px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <PlayCircle className="w-4 h-4 text-[#06B6D4]" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/80">Message Trigger</div>
        </div>
        <div className="text-[12px] text-white/60">Starts when: <span className="text-white/90 font-medium">{data.triggerType || "Webhook"}</span></div>
      </div>
      <Handle type="source" position={Position.Bottom} className={`${sourceHandleStyle}`} />
    </div>
  );
}

export function ExtractNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[220px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Braces className="w-3.5 h-3.5 text-white/50" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/80">Extract Entities</div>
        </div>
        <div className="flex gap-1 flex-wrap">
          {(data.entities || ["name", "email"]).map((e: string) => (
            <span key={e} className="px-1.5 py-0.5 rounded bg-white/5 text-white/60 text-[10px] uppercase tracking-wider">{e}</span>
          ))}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="success" className={`${sourceHandleStyle} !bg-[#0A0A0A]`} style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="missing" className={`${sourceHandleStyle} !border-red-500/40 !bg-[#0A0A0A]`} style={{ left: '70%' }} />
    </div>
  );
}

export function FormatNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[220px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-1">
          <Paintbrush className="w-3.5 h-3.5 text-white/50" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/80">Format Response</div>
        </div>
        <div className="text-[12px] text-white/50">{data.formatType || "Clean & Add Buttons"}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className={`${sourceHandleStyle}`} />
    </div>
  );
}

export function MemoryNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[220px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-3.5 h-3.5 text-white/50" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/80">Context Memory</div>
        </div>
        <div className="text-[12px] text-white/50">Save to: <span className="text-white/80">{data.scope || "Session"}</span></div>
      </div>
      <Handle type="source" position={Position.Bottom} className={`${sourceHandleStyle}`} />
    </div>
  );
}

export function WaitNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[220px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-1">
          <Hourglass className="w-3.5 h-3.5 text-white/50" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/80">Wait for Event</div>
        </div>
        <div className="text-[12px] text-white/50">Halts execution until: <br/><span className="text-white/80 font-medium mt-1 inline-block">{data.event || "User Reply"}</span></div>
      </div>
      <Handle type="source" position={Position.Bottom} className={`${sourceHandleStyle}`} />
    </div>
  );
}

export function ResumeParserNode({ id, data, selected }: { id: string, data: any, selected?: boolean }) {
  return (
    <div className={`w-[220px] rounded-[16px] bg-[#0A0A0A] shadow-xl overflow-visible relative group transition-all duration-300 ${selected ? 'border border-[#06B6D4] ring-1 ring-[#06B6D4]/20 scale-[1.02]' : 'border border-white/10'}`}>
      <NodeActions id={id} />
      <Handle type="target" position={Position.Top} className={`${targetHandleStyle}`} />
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-3.5 h-3.5 text-white/50" />
          <div className="font-semibold text-[11px] uppercase tracking-widest text-white/80">Parse Resume PDF</div>
        </div>
        <div className="text-[12px] text-white/50">Extracts: <span className="text-white/80">{data.extracts || "Skills, Experience"}</span></div>
      </div>
      
      <Handle type="source" position={Position.Bottom} id="success" className={`${sourceHandleStyle} !bg-[#0A0A0A]`} style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="error" className={`${sourceHandleStyle} !border-red-500/40 !bg-[#0A0A0A]`} style={{ left: '70%' }} />
    </div>
  );
}
