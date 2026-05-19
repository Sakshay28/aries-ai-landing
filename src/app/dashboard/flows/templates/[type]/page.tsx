"use client";

import { ArrowLeft, Loader2, LayoutTemplate, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { BUSINESS_TYPE_CONFIG } from "../../config";

export default function TemplatePickerPage() {
  const router = useRouter();
  const params = useParams();
  const businessType = params.type as string;
  const config = BUSINESS_TYPE_CONFIG[businessType];

  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null);

  useEffect(() => {
    if (!config) {
      router.replace('/dashboard/flows/select-type');
    }
  }, [config, router]);

  if (!config) return null;

  const handleSelectTemplate = (templateId: string) => {
    setLoadingTemplate(templateId);
    setTimeout(() => {
      // In a real app, templateId would load specific nodes. 
      // We pass the type to contextually highlight the sidebar.
      router.push(`/dashboard/flows/editor/new?type=${businessType}&template=${templateId}`);
    }, 400);
  };

  return (
    <div className="h-[calc(100vh-64px)] lg:h-screen flex flex-col bg-[#030303] text-white selection:bg-emerald-500/30 overflow-y-auto">
      {/* Top Bar */}
      <header className="h-[52px] flex-shrink-0 border-b border-[rgba(255,255,255,0.08)] bg-[#0A0A0A] flex items-center px-4 z-20 sticky top-0">
        <div className="flex items-center gap-2 text-[13px]">
          <Link href="/dashboard/flows/select-type" className="p-1.5 -ml-1.5 rounded-md hover:bg-white/5 text-gray-400 hover:text-white transition-colors mr-1">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Link href="/dashboard/flows" className="text-gray-400 hover:text-white transition-colors">
            Flows
          </Link>
          <span className="text-gray-500">/</span>
          <Link href="/dashboard/flows/select-type" className="text-gray-400 hover:text-white transition-colors">
            {config.name}
          </Link>
          <span className="text-gray-500">/</span>
          <span className="text-white font-medium">Choose Template</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 p-8 md:p-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <h1 className="font-sans text-[28px] font-bold text-white mb-2">
              Choose a template to get started
            </h1>
            <p className="font-sans text-[14px] text-gray-400">
              Pick a pre-built {config.name.toLowerCase()} flow or start blank. You can customize everything.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {config.templates.map((t: any) => (
              <div 
                key={t.id}
                onClick={() => handleSelectTemplate(t.id)}
                className="group relative cursor-pointer bg-[#0A0A0A] border border-[rgba(255,255,255,0.06)] rounded-[16px] p-6 h-[160px] flex flex-col hover:border-[#06B6D4]/40 transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(6,182,212,0.15)] overflow-hidden"
              >
                {/* Subtle top illumination on hover */}
                <div 
                  className="absolute top-0 left-0 w-full h-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: 'linear-gradient(90deg, transparent, #06B6D4, transparent)' }}
                />

                {loadingTemplate === t.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[rgba(10,10,10,0.8)] z-10 rounded-[16px] backdrop-blur-sm">
                    <Loader2 className="w-8 h-8 animate-spin text-[#06B6D4]" />
                  </div>
                )}

                <div className="flex items-center gap-3 mb-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[rgba(255,255,255,0.03)] flex items-center justify-center border border-[rgba(255,255,255,0.05)] group-hover:border-[#06B6D4]/30 transition-colors duration-300">
                    <LayoutTemplate className="w-4 h-4 text-gray-400 group-hover:text-[#06B6D4] transition-colors duration-300" />
                  </div>
                  <h3 className="font-sans text-[15px] font-semibold text-white/90 leading-tight flex-1 tracking-tight">
                    {t.name}
                  </h3>
                </div>
                
                <p className="font-sans text-[13px] text-gray-500/90 leading-relaxed line-clamp-2 mb-4 group-hover:text-gray-400 transition-colors duration-300">
                  {t.description}
                </p>

                {/* Animated Arrow */}
                <div className="absolute right-6 bottom-6 opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500 ease-out flex items-center justify-center w-8 h-8 rounded-full bg-[#06B6D4]/10 text-[#06B6D4]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </div>
              </div>
            ))}

            {/* Blank Flow Card */}
            <div 
              onClick={() => handleSelectTemplate('blank')}
              className="group relative border-2 border-dashed border-[rgba(255,255,255,0.15)] rounded-[16px] p-6 h-[180px] flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.3)] transition-all duration-200 ease-out hover:-translate-y-1"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectTemplate('blank'); }}
            >
              {loadingTemplate === 'blank' && (
                <div className="absolute inset-0 flex items-center justify-center bg-[rgba(10,10,10,0.8)] z-10 rounded-[16px]">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
              )}
              
              <div className="w-12 h-12 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-200">
                <Plus className="w-6 h-6 text-gray-400 group-hover:text-white" />
              </div>
              <h3 className="font-sans text-[15px] font-semibold text-white tracking-tight">Blank Flow</h3>
              <p className="font-sans text-[13px] text-gray-500 mt-1">Start from scratch</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
