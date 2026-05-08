"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Command, Menu, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSidebar } from "./SidebarContext";

export default function AppHeader({ userEmail }: { userEmail?: string }) {
  const { toggleMobile } = useSidebar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = (userEmail?.[0] ?? "A").toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-4 md:px-6">
      {/* Mobile menu */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleMobile}
        className="h-8 w-8 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* AI search */}
      <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 transition-colors focus-within:border-indigo-500 focus-within:bg-white sm:flex md:max-w-md">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <Input
          ref={inputRef}
          type="search"
          placeholder="Search or ask AI..."
          className="h-6 flex-1 border-0 bg-transparent p-0 text-sm shadow-none placeholder:text-gray-400 focus-visible:ring-0"
        />
        <kbd className="hidden items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 md:inline-flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </div>

      {/* Spacer on mobile */}
      <div className="flex-1 sm:hidden" />

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <Button size="sm" className="hidden gap-1.5 sm:inline-flex">
          <Plus className="h-4 w-4" />
          New
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        </Button>

        {/* Workspace pill */}
        <Button variant="outline" size="sm" className="hidden gap-2 sm:inline-flex">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-indigo-100 text-[10px] font-bold text-indigo-700">
            A
          </span>
          <span className="text-sm">Aries</span>
        </Button>

        {/* Profile */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-200"
            aria-label="Account menu"
          >
            {initials}
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
              <div className="px-4 py-2">
                <div className="text-sm font-semibold text-gray-900">Signed in</div>
                <div className="truncate text-xs text-gray-500">{userEmail || "preview@aries.ai"}</div>
              </div>
              <div className="my-1 border-t border-gray-100" />
              <a href="/dashboard/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Settings
              </a>
              <a href="/dashboard/billing" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Billing
              </a>
              <div className="my-1 border-t border-gray-100" />
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="block w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
