import {
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  PlayCircle,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Activity = {
  id: string;
  user: string;
  action: string;
  time: string;
  icon: LucideIcon;
  tone: "success" | "info" | "warning";
};

const activities: Activity[] = [
  {
    id: "1",
    user: "Riya Sharma",
    action: "resolved 12 conversations",
    time: "2m ago",
    icon: CheckCircle2,
    tone: "success",
  },
  {
    id: "2",
    user: "Aarav Patel",
    action: "started Lead-Qualifier workflow",
    time: "14m ago",
    icon: PlayCircle,
    tone: "info",
  },
  {
    id: "3",
    user: "System",
    action: "flagged 3 SLA breaches",
    time: "28m ago",
    icon: AlertTriangle,
    tone: "warning",
  },
  {
    id: "4",
    user: "Diya Kumar",
    action: "replied to 8 WhatsApp threads",
    time: "41m ago",
    icon: MessageSquare,
    tone: "info",
  },
  {
    id: "5",
    user: "Karan Mehta",
    action: "added 22 new leads",
    time: "1h ago",
    icon: UserPlus,
    tone: "success",
  },
];

const toneStyles: Record<Activity["tone"], string> = {
  success: "bg-emerald-50 text-emerald-600",
  info: "bg-indigo-50 text-indigo-600",
  warning: "bg-amber-50 text-amber-600",
};

export function TeamActivity() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Team Activity</CardTitle>
        <CardDescription>Recent actions across your workspace</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {activities.map((a) => {
            const Icon = a.icon;
            return (
              <li key={a.id} className="flex items-start gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneStyles[a.tone]}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{a.user}</span>{" "}
                    <span className="text-gray-500">{a.action}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">{a.time}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
