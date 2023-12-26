import { Link } from "@remix-run/react";

export default function NoteIdRoute() {
  return (
    <div className="container pt-12 border-8 border-red-500">
      <Link to=".." relative="path">
        Notes overview
      </Link>
      <h2 className="text-h2">Some Note</h2>
    </div>
  );
}
