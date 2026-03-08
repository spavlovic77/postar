import { ResponsiveLayout } from "@/components/layout/responsiveLayout"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ResponsiveLayout>{children}</ResponsiveLayout>
}
