import { AssetLibraryView } from "@/components/asset-library-view";
import { DashboardShell } from "@/components/dashboard-shell";

export default function LibraryPage() {
  return (
    <DashboardShell activeItem="Biblioteca">
      <AssetLibraryView />
    </DashboardShell>
  );
}
