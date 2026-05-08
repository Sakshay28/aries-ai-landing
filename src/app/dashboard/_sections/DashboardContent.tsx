import { ActiveWorkflows } from "./ActiveWorkflows";
import { AgentPerformance } from "./AgentPerformance";
import { ConversationOverview } from "./ConversationOverview";
import { HeroSection } from "./HeroSection";
import { ResponseMetrics } from "./ResponseMetrics";
import { TeamActivity } from "./TeamActivity";
import { UnresolvedConversations } from "./UnresolvedConversations";

export function DashboardContent() {
  return (
    <div className="-mx-4 -my-4 md:-mx-6 md:-my-6 lg:-mx-8 lg:-my-8">
      <HeroSection />

      <div className="space-y-6 px-6 py-8 md:space-y-8">
        {/* KPI row */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <ConversationOverview />
          <ActiveWorkflows />
          <UnresolvedConversations />
        </div>

        {/* Metrics + Activity */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ResponseMetrics />
          </div>
          <TeamActivity />
        </div>

        {/* Agent performance */}
        <div>
          <AgentPerformance />
        </div>
      </div>
    </div>
  );
}
