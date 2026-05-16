import { Activity, MessageSquare, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const activities = [
  {
    id: 1,
    type: "message",
    user: "Sarah Chen",
    action: "Resolved conversation",
    target: "Customer #4521",
    time: "5 min ago",
    icon: CheckCircle,
  },
  {
    id: 2,
    type: "workflow",
    user: "Alex Kim",
    action: "Started workflow",
    target: "Lead Qualification",
    time: "12 min ago",
    icon: Activity,
  },
  {
    id: 3,
    type: "alert",
    user: "System",
    action: "Agent performance",
    target: "Below threshold",
    time: "23 min ago",
    icon: AlertCircle,
  },
  {
    id: 4,
    type: "message",
    user: "Jordan Lee",
    action: "Sent message",
    target: "Team channel",
    time: "1 hour ago",
    icon: MessageSquare,
  },
];

export function TeamActivity() {
  return (
    <Card className="border-border bg-card shadow-none">
      <CardHeader>
        <CardTitle className="text-foreground">Team Activity</CardTitle>
        <CardDescription className="text-muted-foreground">Recent actions and updates</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => {
            const Icon = activity.icon;
            return (
              <div key={activity.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    <span className="text-muted-foreground">{activity.user}</span>
                    {" "}
                    {activity.action}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{activity.target}</p>
                  <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
