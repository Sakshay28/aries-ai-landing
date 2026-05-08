"use client";

import { useSidebar } from "./SidebarContext";

export default function Backdrop() {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();
  if (!isMobileOpen) return null;
  return (
    <div
      onClick={toggleMobileSidebar}
      className="fixed inset-0 z-40 bg-gray-900/40 lg:hidden"
      aria-hidden
    />
  );
}
