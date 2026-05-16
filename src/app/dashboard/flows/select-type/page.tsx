"use client";

import { ShoppingCart, Calendar, Home, BookOpen, Users, UtensilsCrossed, Coins, Heart, Zap, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUSINESS_TYPE_CONFIG } from "../config";

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

export default function SelectBusinessTypePage() {
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

  // Separate regular cards from the blank card
  const mainCards = businessTypes.filter(t => t.id !== 'blank');
  const blankCard = businessTypes.find(t => t.id === 'blank');

  return (
    <div className="h-[calc(100vh-64px)] lg:h-screen flex flex-col bg-[#0F0F0F] text-white selection:bg-emerald-500/30 overflow-y-auto">
      {/* Top Bar */}
      <header className="h-[52px] flex-shrink-0 border-b border-[rgba(255,255,255,0.08)] bg-[#0A0A0A] flex items-center px-4 z-20 sticky top-0">
        <div className="flex items-center gap-2 text-[13px]">
          <Link href="/dashboard/flows" className="p-1.5 -ml-1.5 rounded-md hover:bg-white/5 text-gray-400 hover:text-white transition-colors mr-1">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Link href="/dashboard/flows" className="text-gray-400 hover:text-white transition-colors">
            Flows
          </Link>
          <span className="text-gray-500">/</span>
          <span className="text-white font-medium">Start New Flow</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center px-4 md:px-8 py-10 pb-20">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-12">
            <h1 className="font-sans text-3xl md:text-[36px] font-bold text-white mb-2 tracking-tight">
              What type of business are you?
            </h1>
            <p className="font-sans text-[16px] text-gray-400">
              We'll recommend templates and features tailored to your industry.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mainCards.map((card) => {
              const Icon = card.Icon;
              const isLoading = loadingType === card.id;

              return (
                <div
                  key={card.id}
                  onClick={() => handleSelect(card.id)}
                  className="relative flex flex-col bg-[#0A0A0A] border border-[rgba(255,255,255,0.06)] rounded-[16px] p-6 h-[240px] cursor-pointer group transition-all duration-300 ease-out hover:border-[#06B6D4]/40 hover:shadow-[0_12px_32px_rgba(0,0,0,0.6)] hover:-translate-y-1 overflow-hidden"
                  role="button"
                  aria-label={`Select ${card.name}`}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(card.id); }}
                >
                  <div 
                    className="absolute top-0 left-0 w-full h-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{ background: 'linear-gradient(90deg, transparent, #06B6D4, transparent)' }}
                  />
                  
                  {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[rgba(15,15,15,0.8)] z-10 rounded-[16px]">
                      <Loader2 className="w-8 h-8 animate-spin" style={{ color: card.color }} />
                    </div>
                  ) : null}

                  <div className="flex justify-between items-start">
                    <div className="w-10 h-10 rounded-lg bg-[rgba(255,255,255,0.03)] flex items-center justify-center border border-[rgba(255,255,255,0.05)] group-hover:border-[#06B6D4]/30 transition-colors duration-300">
                      <Icon className="w-5 h-5 text-gray-400 group-hover:text-[#06B6D4] transition-colors duration-300" />
                    </div>
                    <span 
                      className="font-sans text-[12px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-[#06B6D4] tracking-wide"
                    >
                      Use System
                    </span>
                  </div>

                  <h3 className="font-sans text-[16px] font-bold text-white/90 mt-4 tracking-tight group-hover:text-white transition-colors duration-300">
                    {card.name}
                  </h3>
                  
                  <p className="font-sans text-[13px] text-gray-500/90 leading-relaxed mt-1.5 line-clamp-2">
                    {card.description}
                  </p>

                  <div className="mt-auto flex flex-col gap-1.5">
                    {(card.capabilities || []).map((tag: string, i: number) => (
                      <div key={i} className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="w-1 h-1 rounded-full bg-[#06B6D4]/60" />
                        <span className="text-[11px] text-gray-400 font-medium">
                          {tag}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {blankCard && (
              <div
                onClick={() => handleSelect(blankCard.id)}
                className="relative flex flex-col bg-[#0A0A0A] border border-[rgba(255,255,255,0.06)] rounded-[16px] p-6 h-[240px] cursor-pointer group transition-all duration-300 ease-out hover:border-[#06B6D4]/40 hover:shadow-[0_12px_32px_rgba(0,0,0,0.6)] hover:-translate-y-1 overflow-hidden"
                role="button"
                aria-label="Start from blank canvas"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(blankCard.id); }}
              >
                <div 
                  className="absolute top-0 left-0 w-full h-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: 'linear-gradient(90deg, transparent, #06B6D4, transparent)' }}
                />
                
                {loadingType === blankCard.id ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-[rgba(10,10,10,0.8)] z-10 rounded-[16px] backdrop-blur-sm">
                    <Loader2 className="w-8 h-8 animate-spin text-[#06B6D4]" />
                  </div>
                ) : null}

                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 rounded-lg bg-[rgba(255,255,255,0.03)] flex items-center justify-center border border-[rgba(255,255,255,0.05)] group-hover:border-[#06B6D4]/30 transition-colors duration-300">
                    <blankCard.Icon className="w-5 h-5 text-gray-400 group-hover:text-[#06B6D4] transition-colors duration-300" />
                  </div>
                  <span 
                    className="font-sans text-[12px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-[#06B6D4] tracking-wide"
                  >
                    Start Blank
                  </span>
                </div>

                <h3 className="font-sans text-[16px] font-bold text-white/90 mt-4 tracking-tight group-hover:text-white transition-colors duration-300">
                  {blankCard.name}
                </h3>
                
                <p className="font-sans text-[13px] text-gray-500/90 leading-relaxed mt-1.5 line-clamp-2">
                  {blankCard.description}
                </p>

                <div className="mt-auto flex flex-col gap-1.5">
                  {(blankCard.capabilities || []).map((tag: string, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-1 h-1 rounded-full bg-[#06B6D4]/60" />
                      <span className="text-[11px] text-gray-400 font-medium">
                        {tag}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
