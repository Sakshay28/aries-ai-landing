import { ArrowUpRight, MessageSquare } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ConversationOverview() {
  return (
    <Card className="transition-colors hover:bg-gray-50/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <MessageSquare className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base">Active Conversations</CardTitle>
              <CardDescription>Last 24 hours</CardDescription>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-indigo-600" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="text-3xl font-bold tracking-tight text-gray-900">1,247</div>
            <p className="text-sm text-gray-500">+18% from yesterday</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="h-2 w-2 rounded-full bg-indigo-600" />
            <span>342 ongoing</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
