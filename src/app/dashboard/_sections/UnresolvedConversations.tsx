import { AlertCircle, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function UnresolvedConversations() {
  return (
    <Card className="border-border bg-card hover:bg-card/80 transition-colors shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-base text-foreground">Unresolved</CardTitle>
              <CardDescription className="text-muted-foreground">Needs attention</CardDescription>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-destructive" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="text-3xl font-bold tracking-tight text-foreground">89</div>
            <p className="text-sm text-muted-foreground">-12% from yesterday</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            <span>23 overdue</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
