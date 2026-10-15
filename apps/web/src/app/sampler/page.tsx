import { DashboardShell } from "@/components/dashboard-shell";
import { SamplerPanel } from "@/components/sampler-panel";

export default function SamplerPage() {
  return (
    <DashboardShell activeItem="Sampler">
      <SamplerPanel />
    </DashboardShell>
  );
}
