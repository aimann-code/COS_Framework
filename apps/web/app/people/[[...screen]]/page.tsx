import { notFound } from "next/navigation";
import PeopleWorkspace from "../../../components/hrms/employee-management/people-workspace";
import { people_path_valid } from "../../../lib/hrms/employee-management/people-routes";

export default async function Page({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  const { screen } = await params;
  const path =
    "/people" + (screen?.length ? `/${screen.join("/")}` : "");
  if (!people_path_valid(path)) notFound();
  return <PeopleWorkspace />;
}
