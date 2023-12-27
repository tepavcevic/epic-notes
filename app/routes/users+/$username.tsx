import { Link, useLoaderData } from "@remix-run/react";
import { LoaderFunctionArgs, json } from "@remix-run/node";
import { invariantResponse } from "../..//utils/misc";

export function loader({ params }: LoaderFunctionArgs) {
  const users = [
    {
      id: "9d6eba59daa2fc2078cf8205cd451041",
      email: "kody@kcd.dev",
      username: "kody",
      name: "Kody",
    },
  ];

  const user = users.find((user) => user.username === params.username);

  invariantResponse(user, "User not found", { status: 404 });

  return json({
    user,
  });
}

export default function UserProfileRoute() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="container mb-48 mt-36">
      <h1 className="text-h1">{user.name || user.username}</h1>
      <Link to="notes" className="underline">
        Notes
      </Link>
    </div>
  );
}
