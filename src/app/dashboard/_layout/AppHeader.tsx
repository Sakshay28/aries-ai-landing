"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./SidebarContext";
import Image from "next/image";

export default function AppHeader() {
  const { toggleMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleMobile}
        className="h-9 w-9 text-foreground hover:bg-muted"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-white overflow-hidden shadow-sm">
          <Image src="/logo.png" alt="Aries AI Logo" width={28} height={28} className="object-cover" />
        </div>
        <span className="text-sm font-bold tracking-tight text-foreground">Aries AI</span>
      </div>
    </header>
  );
}
