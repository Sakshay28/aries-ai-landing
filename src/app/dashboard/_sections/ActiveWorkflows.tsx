import { ArrowUpRight, Workflow } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ActiveWorkflows() {
  return (
    <Card className="transition-colors hover:bg-gray-50/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <Workflow className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-base">Active Workflows</CardTitle>
              <CardDescription>Currently running</CardDescription>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-emerald-600" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="text-3xl font-bold tracking-tight text-gray-900">42</div>
            <p className="text-sm text-gray-500">+5 started today</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>8 at risk</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
