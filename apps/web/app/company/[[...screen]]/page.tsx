import { notFound } from "next/navigation";
import CompanyWorkspace from "../../../components/shared/company-workspace";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "COS · Company workspace",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  const { screen } = await params;
  const view = (screen ?? []).join("/");
  if (!["", "services", "configuration"].includes(view)) notFound();
  return <CompanyWorkspace view={view} />;
}
