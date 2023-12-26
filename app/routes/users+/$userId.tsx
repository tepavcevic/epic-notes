import { Link } from "@remix-run/react";

export default function UserProfileRoute() {
  return (
    <div className="container mb-48 mt-36 border-4 border-green-500">
      <h1 className="text-h1">User</h1>
      <Link to="notes">Notes</Link>
    </div>
  );
}
