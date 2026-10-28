import Link from "next/link";
export default function NotFound() {
  return (
    <main className="route-error-page">
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>This page isn’t here.</h1>
      <p>Check the address, or return to your workspace.</p>
      <Link href="/" className="button primary">
        Back to overview
      </Link>
    </main>
  );
}
