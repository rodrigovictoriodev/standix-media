import { DashboardShell } from "@/components/dashboard-shell";
import { PresentationStudio } from "@/components/presentation-studio";

export default function PresentationsPage() {
  return (
    <DashboardShell activeItem="Apresentações">
      <PresentationStudio />
    </DashboardShell>
  );
}
