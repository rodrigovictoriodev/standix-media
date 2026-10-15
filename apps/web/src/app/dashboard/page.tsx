import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardOverview } from "@/components/dashboard-overview";

export default function DashboardPage() {
  return (
    <DashboardShell>
      <DashboardOverview />
    </DashboardShell>
  );
}
