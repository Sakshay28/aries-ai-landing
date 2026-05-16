"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Plug, ShoppingBag, Database, Webhook, CheckCircle2, ArrowRight } from 'lucide-react';

const INTEGRATIONS = [
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Sync customer data, order history, and trigger abandoned cart flows.',
    icon: ShoppingBag,
    status: 'connected',
    color: 'text-[#95BF47]',
    bgColor: 'bg-[#95BF47]/10'
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Two-way sync for leads and conversations into your CRM.',
    icon: Database,
    status: 'available',
    color: 'text-[#FF7A59]',
    bgColor: 'bg-[#FF7A59]/10'
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Enterprise CRM sync for qualified hot leads.',
    icon: Database,
    status: 'available',
    color: 'text-[#00A1E0]',
    bgColor: 'bg-[#00A1E0]/10'
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
