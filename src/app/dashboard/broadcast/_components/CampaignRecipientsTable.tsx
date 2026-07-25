import React, { useEffect, useState, useMemo } from 'react';
import { Search, CheckCircle2, Eye, Send, AlertCircle, Clock, Users, ArrowRight } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/utils/phone';

interface Recipient {
  id: string;
  phone: string;
  name: string | null;
  status: 'read' | 'delivered' | 'sent' | 'failed' | 'cancelled' | 'pending';
  delivered_at: string | null;
  read_at: string | null;
  failure_reason: string | null;
  processed_at: string | null;
}

interface CampaignRecipientsTableProps {
  campaignId: string;
}

export function CampaignRecipientsTable({ campaignId }: CampaignRecipientsTableProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    async function fetchRecipients() {
      try {
        setLoading(true);
        const res = await fetch(`/api/broadcast/campaign/${campaignId}/recipients`);
        const json = await res.json();
        if (res.ok && json.success) {
          setRecipients(json.data || []);
        }
      } catch (err) {
        console.error('Failed to load campaign recipients:', err);
      } finally {
        setLoading(false);
      }
    }

    if (campaignId) {
      fetchRecipients();
    }
  }, [campaignId]);

  const filteredRecipients = useMemo(() => {
    return recipients.filter((r) => {
      // Filter by status
      if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false;
      }
      // Filter by search
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = r.name?.toLowerCase().includes(q);
        const matchPhone = r.phone.includes(q);
        return matchName || matchPhone;
      }
      return true;
    });
  }, [recipients, statusFilter, search]);

  const totalPages = Math.max(Math.ceil(filteredRecipients.length / pageSize), 1);
  const paginatedRecipients = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecipients.slice(start, start + pageSize);
  }, [filteredRecipients, currentPage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'read':
        return { label: 'Read', cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800', icon: Eye };
      case 'delivered':
        return { label: 'Delivered', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800', icon: CheckCircle2 };
      case 'sent':
        return { label: 'Sent', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800', icon: Send };
      case 'failed':
      case 'cancelled':
        return { label: status === 'cancelled' ? 'Capped' : 'Failed', cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800', icon: AlertCircle };
      default:
        return { label: 'Processing', cls: 'bg-secondary text-muted-foreground border-border', icon: Clock };
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-card border border-border/60 rounded-2xl">
        <div className="w-8 h-8 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mb-3" />
        <p className="text-[13px] text-muted-foreground font-medium">Loading recipient contacts directory...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Status Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-4 border border-border/60 rounded-2xl shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full h-9 pl-9 pr-3 text-[13px] bg-background border border-border rounded-xl focus:outline-none focus:border-indigo-500/40"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none">
          {[
            { id: 'all', label: `All (${recipients.length})` },
            { id: 'read', label: 'Read' },
            { id: 'delivered', label: 'Delivered' },
            { id: 'sent', label: 'Sent' },
            { id: 'failed', label: 'Failed / Capped' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setStatusFilter(f.id);
                setCurrentPage(1);
              }}
              className={`h-8 px-3 text-[12px] font-semibold rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === f.id
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground border-border hover:bg-secondary/40'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recipient Table */}
      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-4 items-center p-4 border-b border-border/60 bg-secondary/30 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
          <div className="pl-2">Recipient Contact</div>
          <div className="hidden sm:block">Status</div>
          <div className="hidden sm:block">Interaction Timestamp</div>
          <div className="hidden sm:block text-right pr-2">Details</div>
        </div>

        {paginatedRecipients.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-[13px] font-semibold text-foreground">No recipients found</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">Try clearing filters or search query.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {paginatedRecipients.map((r) => {
              const badge = getStatusBadge(r.status);
              const BadgeIcon = badge.icon;
              const formattedPhone = formatPhoneDisplay(r.phone);
              const displayName = r.name && r.name.trim() ? r.name : formattedPhone;

              return (
                <div key={r.id} className="grid grid-cols-1 sm:grid-cols-4 items-center p-4 hover:bg-secondary/20 transition-colors">
                  {/* Name & Phone */}
                  <div className="min-w-0">
                    <h4 className="text-[13.5px] font-semibold text-foreground truncate">{displayName}</h4>
                    {displayName !== formattedPhone && (
                      <p className="text-[11.5px] text-muted-foreground/60 truncate mt-0.5">{formattedPhone}</p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${badge.cls}`}>
                      <BadgeIcon className="w-3.5 h-3.5" />
                      {badge.label}
                    </span>
                  </div>

                  {/* Timestamps */}
                  <div className="text-[12px] text-muted-foreground">
                    {r.read_at ? (
                      <span>Read: {new Date(r.read_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
                    ) : r.delivered_at ? (
                      <span>Delivered: {new Date(r.delivered_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
                    ) : r.processed_at ? (
                      <span>Dispatched: {new Date(r.processed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                    ) : (
                      <span>In Queue</span>
                    )}
                  </div>

                  {/* Failure / Notes */}
                  <div className="text-[12px] sm:text-right font-medium text-rose-600 dark:text-rose-400 truncate">
                    {r.failure_reason ? r.failure_reason : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {filteredRecipients.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border/60 bg-secondary/10 text-[12px] text-muted-foreground">
            <span>
              Showing <strong className="text-foreground tabular-nums">{((currentPage - 1) * pageSize) + 1}</strong> to <strong className="text-foreground tabular-nums">{Math.min(currentPage * pageSize, filteredRecipients.length)}</strong> of <strong className="text-foreground tabular-nums">{filteredRecipients.length}</strong> recipients
            </span>

            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                className="h-8 px-3 font-semibold bg-background border border-border hover:bg-secondary rounded-lg disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="font-semibold text-foreground px-2">Page {currentPage} of {totalPages}</span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                className="h-8 px-3 font-semibold bg-background border border-border hover:bg-secondary rounded-lg disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
