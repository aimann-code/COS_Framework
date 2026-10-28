import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "COS · Employee Management",
  description:
    "Employee registration, requests, and configurable employee details.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
