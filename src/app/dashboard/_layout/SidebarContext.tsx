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
  isExpanded: boolean;
  isHovered: boolean;
  isMobileOpen: boolean;
  openSubmenu: string | null;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  setIsHovered: (hovered: boolean) => void;
  toggleSubmenu: (key: string) => void;
};

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setIsMobileOpen(false);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleSidebar = useCallback(() => setIsExpanded((p) => !p), []);
  const toggleMobileSidebar = useCallback(() => setIsMobileOpen((p) => !p), []);
  const toggleSubmenu = useCallback(
    (key: string) => setOpenSubmenu((prev) => (prev === key ? null : key)),
    [],
  );

  const value = useMemo<SidebarContextValue>(
    () => ({
      isExpanded: isMobile ? false : isExpanded,
      isHovered,
      isMobileOpen,
      openSubmenu,
      toggleSidebar,
      toggleMobileSidebar,
      setIsHovered,
      toggleSubmenu,
    }),
    [
      isMobile,
      isExpanded,
      isHovered,
      isMobileOpen,
      openSubmenu,
      toggleSidebar,
      toggleMobileSidebar,
      toggleSubmenu,
    ],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
