import { DashboardShell } from "@/components/dashboard-shell";
import { EventsDashboardView } from "@/components/events-dashboard";

export default function EventsPage() {
  return (
    <DashboardShell activeItem="Eventos">
      <EventsDashboardView />
    </DashboardShell>
  );
}
