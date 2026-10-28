import { notFound } from "next/navigation";
import { workspace_route } from "../../../lib/shared/cos-routes";
import COSHome from "../../../components/shared/cos-home";
import LiveWorkspaceGateway from "../../../components/shared/live-workspace-gateway";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}): Promise<Metadata> {
  const { screen } = await params;
  return !screen?.length
    ? {
        title: "COS · CulinaOS",
        description:
          "Explore the CulinaOS architecture: people, products, operations and shared platform services, connected in one vision.",
      }
    : {};
}
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  const { screen } = await params;
  if (!workspace_route("/" + (screen ?? []).join("/")).valid) notFound();
  return !screen?.length ? <COSHome /> : <LiveWorkspaceGateway />;
}
