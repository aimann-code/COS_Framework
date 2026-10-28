import { notFound } from "next/navigation";
import PlatformWorkspace from "../../../components/shared/platform-workspace";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "COS · Platform administration",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  const { screen } = await params;
  const view = (screen ?? []).join("/");
  if (
    !["", "companies", "payments", "configuration", "services"].includes(view)
  )
    notFound();
  return <PlatformWorkspace view={view} />;
}
