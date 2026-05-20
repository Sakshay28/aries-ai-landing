import { DashboardContent } from "./_sections/DashboardContent";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function DashboardOverviewPage() {
  return (
    <>
      <ThemeToggle />
      <DashboardContent />
    </>
  );
}
