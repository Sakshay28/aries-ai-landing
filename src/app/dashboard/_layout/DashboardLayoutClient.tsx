"use client";

import type { ReactNode } from "react";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import Backdrop from "./Backdrop";
import { SidebarProvider, useSidebar } from "./SidebarContext";

function Shell({ children, userEmail }: { children: ReactNode; userEmail?: string }) {
  const { isExpanded, isHovered } = useSidebar();
  const expanded = isExpanded || isHovered;
  const mainMargin = expanded ? "lg:ml-[260px]" : "lg:ml-[80px]";

  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar />
      <Backdrop />
      <div className={`flex min-h-screen flex-col transition-all duration-300 ease-in-out ${mainMargin}`}>
        <AppHeader userEmail={userEmail} />
        <main className="flex-1 w-full overflow-x-hidden">
          <div className="w-full p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayoutClient({
  children,
  userEmail,
}: {
  children: ReactNode;
  userEmail?: string;
}) {
  return (
    <SidebarProvider>
      <Shell userEmail={userEmail}>{children}</Shell>
    </SidebarProvider>
  );
}
