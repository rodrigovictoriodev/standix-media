import { PresentationPlayer } from "@/components/presentation-player";

export default async function PresentationPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PresentationPlayer presentationId={id} />;
}
