"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Mail, Shield, Plus, X, Clock, Trash2, Briefcase } from 'lucide-react';
import type { User } from '@/lib/types';
import toast from 'react-hot-toast';

type Me = { id: string; role: string } | null;

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Agent',
  viewer: 'Viewer',
};

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin — full access incl. billing & team' },
  { value: 'manager', label: 'Manager — sees all chats, assigns & reports' },
  { value: 'staff', label: 'Agent — handles assigned conversations' },
  { value: 'viewer', label: 'Viewer — read-only' },
];

export function TeamClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [seatLimit, setSeatLimit] = useState(5);
  const [me, setMe] = useState<Me>(null);

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [inviteSales, setInviteSales] = useState(true);
  const [inviting, setInviting] = useState(false);

  const canManage = me?.role === 'owner' || me?.role === 'admin';
  const seatsLeft = seatLimit - users.length;

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/dashboard/team');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
        setSeatLimit(data.seat_limit ?? 5);
        setMe(data.me ?? null);
      }
    } catch (error) {
      console.error('Failed to fetch users', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);

    try {
      const res = await fetch('/api/dashboard/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, is_sales_agent: inviteSales }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Invitation sent');
        setIsInviteModalOpen(false);
        setInviteEmail('');
        setInviteRole('staff');
        setInviteSales(true);
        fetchUsers();
      } else {
        toast.error(data.error || 'Failed to send invite');
      }
    } catch (error) {
      toast.error('An error occurred');
    } finally {
      setInviting(false);
    }
  };

  const updateMember = async (id: string, patch: { role?: string; is_sales_agent?: boolean }) => {
    // Optimistic update for snappy UX
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, ...patch } as User : u)));
    try {
      const res = await fetch('/api/dashboard/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || 'Update failed');
        fetchUsers(); // revert
      } else {
        toast.success('Updated');
      }
    } catch {
      toast.error('Update failed');
      fetchUsers();
    }
  };

  const removeMember = async (user: User) => {
    if (!confirm(`Remove ${user.full_name || user.email} from the workspace?`)) return;
    try {
      const res = await fetch(`/api/dashboard/team?id=${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Member removed');
        fetchUsers();
      } else {
        toast.error(data.error || 'Failed to remove');
      }
    } catch {
      toast.error('Failed to remove');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400';
      case 'admin': return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400';
      case 'manager': return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400';
      case 'staff': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400';
      default: return 'bg-secondary text-muted-foreground border-border/60';
    }
  };

  const atLimit = seatsLeft <= 0;

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1000px] mx-auto w-full space-y-8">

        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Team Management</h1>
            <p className="text-muted-foreground text-sm max-w-2xl mt-1">
              Invite team members, set roles, and choose who&apos;s on the sales team. Sales agents automatically
              receive new leads from WhatsApp and Meta ads, split evenly (round-robin).
            </p>
          </div>
          <button
            onClick={() => setIsInviteModalOpen(true)}
            disabled={!canManage || atLimit}
            title={!canManage ? 'Only admins can invite' : atLimit ? 'Seat limit reached' : undefined}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-max shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Invite Member
          </button>
        </header>

        {/* Users List */}
        <div className="bg-card border border-border shadow-sm rounded-2xl">
          <div className="px-6 py-4 border-b border-border bg-secondary/30 flex items-center justify-between gap-2 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Workspace Members</h2>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${atLimit ? 'bg-amber-500/10 text-amber-600 border-amber-200' : 'bg-secondary text-muted-foreground border-border/60'}`}>
              {users.length} / {seatLimit} seats used
            </span>
          </div>

          <div className="divide-y divide-border/60">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading members...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No team members found.</div>
            ) : (
              users.map((user) => {
                const isOwner = user.role === 'owner';
                const isSelf = me?.id === user.id;
                const editable = canManage && !isOwner;
                return (
                  <div key={user.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-secondary/10 transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-200 dark:border-indigo-800">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt={user.email} className="w-full h-full rounded-full" />
                        ) : (
                          user.full_name ? user.full_name[0].toUpperCase() : user.email[0].toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm flex items-center gap-2">
                          <span className="truncate">{user.full_name || 'Pending Invite'}</span>
                          {user.auth_id === null && (
                            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-sm shrink-0">Pending</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap md:justify-end">
                      {/* Sales-team toggle */}
                      <button
                        onClick={() => editable && updateMember(user.id, { is_sales_agent: !user.is_sales_agent })}
                        disabled={!editable}
                        title={user.is_sales_agent ? 'On the sales team — receives auto-assigned leads' : 'Not on the sales team'}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                          user.is_sales_agent
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'bg-secondary text-muted-foreground border-border/60'
                        } ${editable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                      >
                        <Briefcase className="w-3 h-3" /> {user.is_sales_agent ? 'Sales' : 'Not sales'}
                      </button>

                      {/* Role: editable select for admins (except owner row), static badge otherwise */}
                      {editable ? (
                        <select
                          value={user.role}
                          onChange={(e) => updateMember(user.id, { role: e.target.value })}
                          className="h-8 pl-2 pr-7 bg-background border border-border rounded-md text-[12px] font-medium focus:border-indigo-500 outline-none"
                        >
                          {ROLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{ROLE_LABELS[opt.value]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${getRoleBadgeColor(user.role)}`}>
                          {ROLE_LABELS[user.role] || user.role}
                        </span>
                      )}

                      {user.last_login_at && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {new Date(user.last_login_at).toLocaleDateString()}
                        </span>
                      )}

                      {/* Remove */}
                      {canManage && !isOwner && !isSelf && (
                        <button
                          onClick={() => removeMember(user)}
                          title="Remove member"
                          className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {!canManage && (
          <p className="text-xs text-muted-foreground text-center">
            You have view-only access to team settings. Ask an admin to make changes.
          </p>
        )}
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsInviteModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
                <h3 className="text-base font-semibold">Invite Team Member</h3>
                <button onClick={() => setIsInviteModalOpen(false)} className="p-1 text-muted-foreground hover:bg-secondary rounded-md">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleInvite} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      required
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full h-10 pl-9 pr-4 bg-background border border-border rounded-lg text-sm focus:border-indigo-500 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Role</label>
                  <div className="relative">
                    <Shield className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full h-10 pl-9 pr-4 bg-background border border-border rounded-lg text-sm focus:border-indigo-500 outline-none transition-colors appearance-none"
                    >
                      {ROLE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inviteSales}
                    onChange={(e) => setInviteSales(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-indigo-600"
                  />
                  <span className="text-sm">
                    <span className="font-medium flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Add to sales team</span>
                    <span className="text-muted-foreground text-xs">New WhatsApp &amp; Meta-ad leads are auto-assigned to sales agents in round-robin.</span>
                  </span>
                </label>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium hover:bg-secondary rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting || !inviteEmail}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {inviting ? 'Sending...' : 'Send Invitation'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
