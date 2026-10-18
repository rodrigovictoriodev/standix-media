import { notFound } from "next/navigation";
import { PresentationPlayer } from "@/components/presentation-player";
import { ScreenLiveView } from "@/components/screen-live-view";

const screenNames = ["main", "stage", "live", "aux"] as const;

export default async function ScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ presentation?: string }>;
}) {
  const { screen } = await params;
  const { presentation } = await searchParams;
  if (!screenNames.includes(screen as (typeof screenNames)[number])) notFound();

  if (presentation) {
    return <PresentationPlayer presentationId={presentation} chromeless />;
  }
  return <ScreenLiveView screen={screen as (typeof screenNames)[number]} />;
}
