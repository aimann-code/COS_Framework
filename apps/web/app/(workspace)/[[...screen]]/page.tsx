import { notFound } from "next/navigation";
import { workspace_route } from "../../../lib/cos-routes";
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  const { screen } = await params;
  if (!workspace_route("/" + (screen ?? []).join("/")).valid) notFound();
  return null;
}
