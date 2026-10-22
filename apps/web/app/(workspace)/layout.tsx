import COSWorkspace from "../../components/cos-workspace";
import COSConnectedWorkspace from "../../components/cos-connected-workspace";
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return process.env.NEXT_PUBLIC_COS_MODE === "demo" ? (
    <COSWorkspace />
  ) : (
    <COSConnectedWorkspace>{children}</COSConnectedWorkspace>
  );
}
