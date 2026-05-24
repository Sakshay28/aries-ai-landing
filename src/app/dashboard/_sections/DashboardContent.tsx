import React from "react";
import { HeroSection } from "./HeroSection";
import { ConversationOverview } from "./ConversationOverview";
import { ActiveWorkflows } from "./ActiveWorkflows";
import { UnresolvedConversations } from "./UnresolvedConversations";
import { ResponseMetrics } from "./ResponseMetrics";
import { TeamActivity } from "./TeamActivity";
import { AgentPerformance } from "./AgentPerformance";

export function DashboardContent() {
  return (
    <div className="bg-background">
      {/* Hero Section */}
      <HeroSection />

      {/* Main Content Grid */}
      <div className="px-6 py-8 max-w-7xl mx-auto space-y-8">
        {/* Top Row: Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ConversationOverview />
          <ActiveWorkflows />
          <UnresolvedConversations />
        </div>

        {/* Middle Row: Metrics and Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ResponseMetrics />
          </div>
          <TeamActivity />
        </div>

        {/* Bottom Row: Agent Performance */}
        <div>
          <AgentPerformance />
        </div>
      </div>
    </div>
  );
}

