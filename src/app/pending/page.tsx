"use client";

import { useEffect, useState } from 'react';
import { Clock, LogOut, Mail, RefreshCw, CheckCircle2 } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function PendingPage() {
  const [checking, setChecking] = useState(true);
  const [approved, setApproved] = useState(false);

  const checkStatus = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setChecking(false);
        return;
      }
      
      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('auth_id', user.id)
        .maybeSingle();
        
      if (userData?.tenant_id) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('is_approved')
          .eq('id', userData.tenant_id)
          .maybeSingle();
          
        if (tenantData?.is_approved) {
          setApproved(true);
          window.location.href = '/dashboard';
          return;
        }
      }
    } catch (err) {
      console.error('Error checking approval status:', err);
    }
    setChecking(false);
  };

  useEffect(() => {
    checkStatus();
    // Poll status every 5 seconds to auto-redirect
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const signOut = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center bg-card border border-border rounded-2xl shadow-sm p-8 space-y-5">
        {approved ? (
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto animate-bounce">
            <CheckCircle2 className="w-7 h-7" />
          </div>
        ) : (
          <div className="w-14 h-14 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto relative">
            <Clock className="w-7 h-7" />
            {checking && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-indigo-500"></span>
              </span>
            )}
          </div>
        )}
        
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {approved ? "Your account is approved!" : "Your account is under review"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {approved 
              ? "Redirecting you to your dashboard now..." 
              : "Thanks for signing up! Our team is reviewing your workspace and will activate it shortly. You'll get an email the moment you're approved."
            }
          </p>
        </div>

        {!approved && (
          <div className="flex flex-col items-center justify-center gap-3 pt-2">
            <button 
              onClick={checkStatus} 
              disabled={checking}
              className="inline-flex items-center gap-2 text-xs font-medium text-foreground bg-secondary hover:bg-secondary/80 border border-border px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
              Check Status
            </button>
            
            <a href="mailto:support@ariesai.in" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline">
              <Mail className="w-4 h-4" /> Contact support
            </a>
          </div>
        )}

        <div className="pt-2 border-t border-border/60">
          <button onClick={signOut} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-3">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

