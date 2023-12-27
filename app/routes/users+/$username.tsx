import { Link, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";

export function loader() {
  return json({
    id: "9d6eba59daa2fc2078cf8205cd451041",
    email: "kody@kcd.dev",
    username: "kody",
    name: "Kody",
  });
}

export default function UserProfileRoute() {
  const loaderData = useLoaderData<typeof loader>();
  return (
    <div className="container mb-48 mt-36">
      <h1 className="text-h1">{loaderData.username || "User"}</h1>
      <Link to="notes" className="underline">
        Notes
      </Link>
    </div>
  );
}
