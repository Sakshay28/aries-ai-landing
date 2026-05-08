import { Sparkles, TrendingUp } from "lucide-react";

export function HeroSection() {
  return (
    <section className="border-b border-gray-200 bg-white">
      <div className="px-6 py-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              <span className="text-sm font-semibold text-gray-500">
                Today's AI Operations
              </span>
            </div>
            <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">
              Operations Dashboard
            </h1>
            <p className="max-w-2xl text-sm text-gray-500">
              Real-time overview of your AI agents, conversations, and operational metrics.
              Monitor performance and take action instantly.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2">
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold text-gray-900">+12.5%</span>
            <span className="text-xs text-gray-500">vs yesterday</span>
          </div>
        </div>
      </div>
    </section>
  );
}
