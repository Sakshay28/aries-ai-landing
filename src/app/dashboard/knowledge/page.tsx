"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, ArrowRight, Library, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function KnowledgeRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    toast.info('📁 Knowledge Base has moved into the new AI Staff Manager!');
    router.push('/dashboard/agents?ref=kb');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full bg-background p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full p-8 rounded-3xl border border-border bg-card shadow-2xl text-center space-y-6"
      >
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
          <Library className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Moving to AI Staff Manager...</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The Knowledge Base has been consolidated into the unified **AI Staff Manager** so you can manage your bot’s identity, prompt guidelines, and documents in one single screen.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
          <span className="text-xs text-muted-foreground font-medium">Redirecting you automatically...</span>
        </div>

        <button
          onClick={() => router.push('/dashboard/agents?ref=kb')}
          className="w-full h-11 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 flex items-center justify-center gap-2 transition-all"
        >
          Go to AI Staff Manager <ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
}
