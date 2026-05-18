"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Plug, ShoppingBag, Database, Webhook, CheckCircle2, ArrowRight, CreditCard, Truck, FileSpreadsheet, Briefcase } from 'lucide-react';

const INTEGRATIONS = [
  {
    id: 'razorpay',
    name: 'Razorpay',
    description: 'Auto-generate payment links and track payment status via WhatsApp.',
    icon: CreditCard,
    status: 'available',
    color: 'text-[#3395FF]',
    bgColor: 'bg-[#3395FF]/10'
  },
  {
    id: 'shiprocket',
    name: 'Shiprocket',
    description: 'Send automated shipping updates and tracking links to customers.',
    icon: Truck,
    status: 'available',
    color: 'text-[#2D9CDB]',
    bgColor: 'bg-[#2D9CDB]/10'
  },
  {
    id: 'zohocrm',
    name: 'Zoho CRM',
    description: 'Two-way sync for leads, contacts, and WhatsApp conversations.',
    icon: Briefcase,
    status: 'available',
    color: 'text-[#F0483E]',
    bgColor: 'bg-[#F0483E]/10'
  },
  {
    id: 'googlesheets',
    name: 'Google Sheets',
    description: 'Instantly log new leads, bookings, and customer details into a spreadsheet.',
    icon: FileSpreadsheet,
    status: 'available',
    color: 'text-[#0F9D58]',
    bgColor: 'bg-[#0F9D58]/10'
  },
  {
    id: 'webhooks',
    name: 'Custom Webhooks',
    description: 'Send event payloads to Zapier, Make, or your custom endpoints.',
    icon: Webhook,
    status: 'available',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10'
  }
];

export function IntegrationsClient() {
  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1000px] mx-auto w-full space-y-8">
        
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Connect Aries AI to your existing tools to create seamless automated workflows.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {INTEGRATIONS.map((integration) => {
            const Icon = integration.icon;
            return (
              <motion.div 
                key={integration.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 rounded-2xl bg-card border border-border shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col h-full hover:border-border/80 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl ${integration.bgColor} ${integration.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  
                  {integration.status === 'connected' ? (
                    <div className="px-2 py-1 text-[10px] font-bold tracking-wider rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> CONNECTED
                    </div>
                  ) : (
                    <button className="text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors flex items-center gap-1">
                      Connect <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="mt-auto">
                  <h3 className="text-lg font-semibold text-foreground mb-1">{integration.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {integration.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
