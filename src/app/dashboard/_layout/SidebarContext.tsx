"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SidebarContextValue = {
  isOpen: boolean;
  isMobileOpen: boolean;
  toggle: () => void;
  toggleMobile: () => void;
  setMobileOpen: (open: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setIsMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggle = useCallback(() => setIsOpen((p) => !p), []);
  const toggleMobile = useCallback(() => setIsMobileOpen((p) => !p), []);
  const setMobileOpen = useCallback((open: boolean) => setIsMobileOpen(open), []);

  const value = useMemo<SidebarContextValue>(
    () => ({ isOpen, isMobileOpen, toggle, toggleMobile, setMobileOpen }),
    [isOpen, isMobileOpen, toggle, toggleMobile, setMobileOpen],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
