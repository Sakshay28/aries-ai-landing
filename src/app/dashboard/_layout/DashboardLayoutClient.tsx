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
      {/* Root: full-screen flex row */}
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <AppSidebar userEmail={userEmail} />
        <Backdrop />

        {/* Content column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Mobile header — hidden on lg */}
          <AppHeader />

          {/*
            main: flex-1 fills remaining height, overflow-hidden clips children.
            position: relative so full-bleed children can use absolute inset-0.
          */}
          <main className="relative flex-1 overflow-hidden">
            {/*
              Default scroll wrapper for normal pages.
              Full-bleed pages (chat) render their own absolute-positioned container
              that covers this wrapper entirely.
            */}
            <div className="h-full w-full overflow-y-auto p-4 md:p-6 lg:p-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
