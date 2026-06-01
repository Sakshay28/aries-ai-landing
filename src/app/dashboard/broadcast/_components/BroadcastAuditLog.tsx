import React, { useEffect, useState } from 'react';
import { ShieldCheck, User, ArrowRight, Layers, FileCode, Users, Trash } from 'lucide-react';

export interface AuditLogItem {
  id: string;
  action: string;
  entity_type: string;
  before_state: Record<string, any>;
  after_state: Record<string, any>;
  created_at: string;
}

interface AuditLogProps {
  campaignId: string;
}

export function BroadcastAuditLog({ campaignId }: AuditLogProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        setLoading(true);
        const res = await fetch(`/api/broadcasts/audit-logs?campaignId=${campaignId}`);
        const data = await res.json();
        if (data.success) {
          setLogs(data.logs || []);
        }
      } catch (err) {
        console.error('Failed to load audit logs:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [campaignId]);

  const getLogIcon = (entity: string) => {
    switch (entity) {
      case 'audience':
        return Users;
      case 'template':
        return FileCode;
      case 'rules':
      case 'automation':
        return Layers;
      default:
        return ShieldCheck;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'launch': return 'Launched Campaign';
      case 'pause': return 'Paused Campaign';
      case 'resume': return 'Resumed Campaign';
      case 'edit': return 'Modified Configurations';
      case 'delete': return 'Deleted Campaign';
      default: return action.charAt(0).toUpperCase() + action.slice(1);
    }
  };

  const formatKey = (key: string) => {
    return key
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + 
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/60 gap-2">
        <ShieldCheck className="w-5 h-5 animate-spin" />
        <span className="text-[11px] font-medium">Loading security audit records...</span>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 border border-dashed border-border/60 rounded-xl bg-background/40">
        <ShieldCheck className="w-6 h-6 text-muted-foreground/45 mb-2.5" />
        <p className="text-[12px] font-semibold text-foreground/80">No audit logs available</p>
        <p className="text-[10px] text-muted-foreground text-center mt-0.5">Accountability audit logs will record automatically on modifications.</p>
      </div>
    );
  }

  return (
    <div className="text-left space-y-5 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
      {logs.map((log) => {
        const Icon = getLogIcon(log.entity_type);
        const keysChanged = Object.keys(log.after_state);

        return (
          <div key={log.id} className="p-3.5 border border-border/60 rounded-xl bg-background space-y-2.5 transition-all hover:border-border/90">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-secondary flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <span className="text-[12px] font-bold text-foreground">
                    {getActionLabel(log.action)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 block font-medium">
                    {formatTime(log.created_at)}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-secondary/40 px-1.5 py-0.5 rounded">
                <User className="w-3 h-3" />
                <span>Sakshay</span>
              </div>
            </div>

            {/* Diffs Breakdown */}
            {keysChanged.length > 0 && (
              <div className="space-y-1.5 pl-8 border-l border-border/40">
                {keysChanged.map((key) => {
                  const valBefore = log.before_state[key];
                  const valAfter = log.after_state[key];

                  // Beautiful human-friendly formatting of values
                  const renderVal = (v: any) => {
                    if (v === null || v === undefined) return '—';
                    if (typeof v === 'boolean') return v ? 'Active' : 'Disabled';
                    if (typeof v === 'object') return JSON.stringify(v);
                    return String(v);
                  };

                  return (
                    <div key={key} className="text-[11.5px] leading-relaxed">
                      <span className="font-semibold text-muted-foreground/80">{formatKey(key)}: </span>
                      <span className="text-muted-foreground line-through tabular-nums">{renderVal(valBefore)}</span>
                      <ArrowRight className="inline-block w-3 h-3 mx-1.5 text-muted-foreground/50 align-middle" />
                      <span className="text-foreground font-bold tabular-nums">{renderVal(valAfter)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
