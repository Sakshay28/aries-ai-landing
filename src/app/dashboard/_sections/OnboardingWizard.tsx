"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Library, Workflow, Smartphone, Check, ChevronRight, X, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    id: 'gupshup',
    title: 'Connect WhatsApp',
    description: 'Link your Gupshup account to start sending and receiving messages.',
    icon: MessageSquare,
    actionLabel: 'Go to Integrations',
    href: '/dashboard/integrations',
  },
  {
    id: 'knowledge',
    title: 'Upload Knowledge Base',
    description: 'Give your AI brain by uploading PDFs, text files, and FAQs.',
    icon: Library,
    actionLabel: 'Upload Docs',
    href: '/dashboard/knowledge',
  },
  {
    id: 'flow',
    title: 'Create Your First Flow',
    description: 'Automate your greetings or build a smart routing rule.',
    icon: Workflow,
    actionLabel: 'Build Flow',
    href: '/dashboard/flows/select-type',
  },
  {
    id: 'test',
    title: 'Test Your Agent',
    description: 'Simulate a conversation to ensure everything works perfectly.',
    icon: Smartphone,
    actionLabel: 'Simulate Now',
    href: '/dashboard/chat',
  },
];

export function OnboardingWizard() {
  const [isOpen, setIsOpen] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const router = useRouter();

  useEffect(() => {
    const isDismissed = localStorage.getItem('aries_onboarding_dismissed');
    const storedSteps = localStorage.getItem('aries_onboarding_steps');
    
    if (storedSteps) {
      setCompletedSteps(JSON.parse(storedSteps));
    }
    
    if (!isDismissed) {
      // Small delay so it pops up after main dashboard loads
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setIsOpen(false);
    localStorage.setItem('aries_onboarding_dismissed', 'true');
  };

  const markStepComplete = (stepId: string) => {
    const newSteps = { ...completedSteps, [stepId]: true };
    setCompletedSteps(newSteps);
    localStorage.setItem('aries_onboarding_steps', JSON.stringify(newSteps));
  };

  const handleAction = (stepId: string, href: string) => {
    markStepComplete(stepId);
    setIsOpen(false);
    router.push(href);
  };

  const progress = Math.round((Object.values(completedSteps).filter(Boolean).length / STEPS.length) * 100);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
            onClick={(e) => e.target === e.currentTarget && dismiss()}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-background border border-border w-full max-w-[600px] rounded-3xl shadow-2xl overflow-hidden relative"
            >
              <button 
                onClick={dismiss}
                className="absolute top-5 right-5 p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header */}
              <div className="px-8 pt-10 pb-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500/10 via-emerald-500/5 to-transparent pointer-events-none" />
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-foreground rounded-2xl flex items-center justify-center mb-6 shadow-md">
                    <Sparkles className="w-6 h-6 text-background" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
                    Welcome to Aries AI
                  </h2>
                  <p className="text-[15px] text-muted-foreground leading-relaxed max-w-md">
                    You're 4 steps away from launching your autonomous customer operations. Let's get everything set up.
                  </p>

                  {/* Progress Bar */}
                  <div className="mt-8 flex items-center gap-4">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="h-full bg-emerald-500"
                      />
                    </div>
                    <span className="text-[13px] font-semibold text-muted-foreground w-10 text-right">{progress}%</span>
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="px-8 pb-10 space-y-4 relative z-10 bg-background">
                {STEPS.map((step, idx) => {
                  const isCompleted = completedSteps[step.id];
                  const Icon = step.icon;
                  
                  return (
                    <div 
                      key={step.id} 
                      className={cn(
                        "group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border transition-all",
                        isCompleted 
                          ? "bg-muted/30 border-transparent opacity-60" 
                          : "bg-card border-border hover:border-foreground/20 hover:shadow-sm cursor-pointer"
                      )}
                      onClick={() => !isCompleted && handleAction(step.id, step.href)}
                    >
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
                          isCompleted ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground group-hover:bg-foreground/5 group-hover:text-foreground"
                        )}>
                          {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                        </div>
                        <div>
                          <h3 className={cn(
                            "text-[15px] font-semibold tracking-tight mb-0.5 transition-colors",
                            isCompleted ? "text-muted-foreground line-through decoration-muted-foreground/30" : "text-foreground group-hover:text-blue-500"
                          )}>
                            {idx + 1}. {step.title}
                          </h3>
                          <p className="text-[13px] text-muted-foreground line-clamp-1">{step.description}</p>
                        </div>
                      </div>
                      
                      {!isCompleted && (
                        <div className="hidden sm:flex items-center gap-1 text-[13px] font-semibold text-foreground bg-muted/50 px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          {step.actionLabel} <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
