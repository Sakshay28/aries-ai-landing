import DashboardLayoutClient from "../dashboard/_layout/DashboardLayoutClient";

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayoutClient userEmail="preview@aries.ai">{children}</DashboardLayoutClient>;
}
