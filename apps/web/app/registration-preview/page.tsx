import type { Metadata } from "next";
import EmployeeOnboardingPreview from "../../components/hrms/employee-management/registration/employee-onboarding-preview";
export const metadata: Metadata = {
  title: "MHL · Employee registration preview",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <EmployeeOnboardingPreview />;
}
