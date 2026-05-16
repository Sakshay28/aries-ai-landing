"use client";

import { ShoppingCart, Calendar, Home, BookOpen, Users, UtensilsCrossed, Coins, Heart, Zap, Loader2, LayoutTemplate } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUSINESS_TYPE_CONFIG } from "./config";

const iconMap: Record<string, any> = {
  ecommerce: ShoppingCart,
  services: Calendar,
  realestate: Home,
  education: BookOpen,
  recruitment: Users,
  restaurants: UtensilsCrossed,
  finance: Coins,
  healthcare: Heart,
  blank: Zap,
};

export default function FlowsDashboardPage() {
  const router = useRouter();
  const [loadingType, setLoadingType] = useState<string | null>(null);

  const handleSelect = (typeId: string) => {
    setLoadingType(typeId);
    setTimeout(() => {
      if (typeId === 'blank') {
        router.push(`/dashboard/flows/editor/new?type=blank`);
      } else {
        router.push(`/dashboard/flows/templates/${typeId}`);
      }
    }, 400); // simulate loading/animation
  };

  const businessTypes = Object.entries(BUSINESS_TYPE_CONFIG).map(([id, config]) => ({
    id,
    ...config,
    Icon: iconMap[id] || Zap
  }));

  const mainCards = businessTypes.filter(t => t.id !== 'blank');
  const blankCard = businessTypes.find(t => t.id === 'blank');

  return (
    <div className="h-[calc(100vh-64px)] lg:h-screen flex flex-col bg-[#0A0A0A] text-white selection:bg-[#06B6D4]/30 overflow-y-auto">
      {/* Top Bar */}
      <header className="h-[52px] flex-shrink-0 border-b border-white/5 bg-[#0A0A0A]/80 backdrop-blur-md flex items-center justify-between px-8 z-20 sticky top-0">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-white/90 font-medium tracking-wide">Automations & Flows</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 px-8 md:px-12 py-12 max-w-6xl w-full animate-in fade-in duration-500 ease-out">
        
        <div className="mb-14">
          <h1 className="font-sans text-[28px] md:text-[34px] font-semibold text-white/90 mb-3 tracking-tight">
            Create Flow
          </h1>
          <p className="font-sans text-[15px] text-white/50 max-w-xl leading-relaxed">
            Select a business model to begin. We'll automatically configure your workspace with industry-specific templates and tools.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
          {mainCards.map((card) => {
            const Icon = card.Icon;
            const isLoading = loadingType === card.id;

            return (
              <div
                key={card.id}
                onClick={() => handleSelect(card.id)}
                className="relative flex flex-col bg-[#111111] border border-white/[0.04] rounded-2xl p-6 h-[260px] cursor-pointer group transition-all duration-300 ease-out hover:bg-[#151515] hover:border-white/[0.08] hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)] hover:-translate-y-1 overflow-hidden outline-none focus-visible:border-[#06B6D4]/50 focus-visible:ring-1 focus-visible:ring-[#06B6D4]/20"
                role="button"
                aria-label={`Select ${card.name}`}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(card.id); }}
              >
                {/* Subtle top illumination on hover */}
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#06B6D4]/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                {isLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#111111]/80 backdrop-blur-sm z-10 rounded-2xl">
                    <Loader2 className="w-6 h-6 animate-spin text-[#06B6D4]" />
                  </div>
                ) : null}

                <div className="flex justify-between items-start mb-5">
                  <div className="w-10 h-10 rounded-[10px] bg-white/[0.03] flex items-center justify-center border border-white/[0.05] group-hover:bg-[#06B6D4]/10 group-hover:border-[#06B6D4]/20 transition-all duration-300">
                    <Icon className="w-5 h-5 text-white/60 group-hover:text-[#06B6D4] transition-colors duration-300" />
                  </div>
                  
                  <span className="font-sans text-[11px] font-medium tracking-wide opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-1 group-hover:translate-x-0 text-white/40 group-hover:text-white/60 uppercase">
                    Select
                  </span>
                </div>

                <h3 className="font-sans text-[16px] font-medium text-white/90 tracking-tight">
                  {card.name}
                </h3>
                
                <p className="font-sans text-[13px] text-white/40 leading-relaxed mt-1.5 line-clamp-2">
                  {card.description}
                </p>

                <div className="mt-auto pt-4 flex flex-col gap-1.5">
                  {(card.capabilities || []).map((cap: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[12px] text-white/50 group-hover:text-white/60 transition-colors">
                      <div className="w-3 flex items-center justify-center">
                        <div className="w-[3px] h-[3px] rounded-full bg-[#06B6D4]/40 group-hover:bg-[#06B6D4] transition-colors" />
                      </div>
                      <span className="truncate">{cap}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {blankCard && (
            <div
              onClick={() => handleSelect(blankCard.id)}
              className="relative flex flex-col bg-transparent border border-dashed border-white/[0.08] rounded-2xl p-6 h-[260px] cursor-pointer group transition-all duration-300 ease-out hover:bg-white/[0.02] hover:border-white/[0.15] hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)] hover:-translate-y-1 overflow-hidden outline-none focus-visible:border-[#06B6D4]/50 focus-visible:ring-1 focus-visible:ring-[#06B6D4]/20"
              role="button"
              aria-label="Start from blank canvas"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(blankCard.id); }}
            >
              {loadingType === blankCard.id ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0A0A0A]/80 backdrop-blur-sm z-10 rounded-2xl">
                  <Loader2 className="w-6 h-6 animate-spin text-[#06B6D4]" />
                </div>
              ) : null}

              <div className="flex justify-between items-start mb-5">
                <div className="w-10 h-10 rounded-[10px] bg-white/[0.02] flex items-center justify-center border border-white/[0.04] group-hover:bg-white/[0.06] transition-colors duration-300">
                  <LayoutTemplate className="w-5 h-5 text-white/40 group-hover:text-white/70 transition-colors duration-300" />
                </div>
              </div>

              <h3 className="font-sans text-[16px] font-medium text-white/90 tracking-tight">
                {blankCard.name}
              </h3>
              
              <p className="font-sans text-[13px] text-white/40 leading-relaxed mt-1.5 line-clamp-2">
                {blankCard.description}
              </p>

              <div className="mt-auto pt-4 flex flex-col gap-1.5">
                {(blankCard.capabilities || []).map((cap: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[12px] text-white/50 group-hover:text-white/60 transition-colors">
                    <div className="w-3 flex items-center justify-center">
                      <div className="w-[3px] h-[3px] rounded-full bg-white/20 group-hover:bg-white/40 transition-colors" />
                    </div>
                    <span className="truncate">{cap}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
