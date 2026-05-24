import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page" style={{ textAlign: "center", paddingTop: "80px" }}>
      <div style={{ fontSize: "4rem", marginBottom: "16px" }}>404</div>
      <h1 className="page-title" style={{ marginBottom: "8px" }}>Page not found</h1>
      <p className="page-subtitle" style={{ marginBottom: "32px" }}>
        This page doesn&apos;t exist or has been moved.
      </p>
      <Link className="btn" href="/dashboard">
        Go to Dashboard
      </Link>
    </div>
  );
}
