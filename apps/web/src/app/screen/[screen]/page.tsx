import { notFound } from "next/navigation";
import { ScreenLiveView } from "@/components/screen-live-view";

const screenNames = ["main", "stage", "live", "aux"] as const;

export default async function ScreenPage({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  if (!screenNames.includes(screen as (typeof screenNames)[number])) notFound();

  return <ScreenLiveView screen={screen as (typeof screenNames)[number]} />;
}
