import { GreetingSection } from "./GreetingSection";
import { DashboardMetrics } from "./DashboardMetrics";
import { QuickActions } from "./QuickActions";
import { RecentChats } from "./RecentChats";
import { OnboardingWizard } from "./OnboardingWizard";

export function DashboardContent() {
  return (
    <div className="bg-background min-h-full">
      <div className="px-2 md:px-6 max-w-6xl mx-auto space-y-10">
        <GreetingSection />
        
        <DashboardMetrics />
        
        <div className="space-y-4">
          <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">Quick Actions</h2>
          <QuickActions />
        </div>

        <div className="space-y-4">
          <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">Recent Chats</h2>
          <RecentChats />
        </div>
      </div>
      
      <OnboardingWizard />
    </div>
  );
}
