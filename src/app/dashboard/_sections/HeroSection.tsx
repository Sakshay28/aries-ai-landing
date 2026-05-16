import { Sparkles, TrendingUp } from "lucide-react";

export function HeroSection() {
  return (
    <div className="border-b border-border bg-card/50">
      <div className="px-6 py-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold text-muted-foreground">Today's AI Operations</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Operations Dashboard</h1>
            <p className="text-muted-foreground max-w-2xl">
              Real-time overview of your AI agents, conversations, and operational metrics. Monitor performance and take action instantly.
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted border border-border">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">+12.5%</span>
            <span className="text-xs text-muted-foreground">vs yesterday</span>
          </div>
        </div>
      </div>
    </div>
  );
}
