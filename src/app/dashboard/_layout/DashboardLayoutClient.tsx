"use client";
import type { ReactNode } from "react";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import Backdrop from "./Backdrop";
import { SidebarProvider } from "./SidebarContext";

export default function DashboardLayoutClient({
  children,
  userEmail,
}: {
  children: ReactNode;
  userEmail?: string;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground overflow-hidden">
        <AppSidebar userEmail={userEmail} />
        <Backdrop />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader />
          <main className="flex-1 overflow-auto">
            <div className="w-full p-4 md:p-6 lg:p-8">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
