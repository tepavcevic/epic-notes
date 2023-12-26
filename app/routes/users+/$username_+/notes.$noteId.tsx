import { Link, useParams } from "@remix-run/react";

export default function NoteIdRoute() {
  const { noteId } = useParams();
  return (
    <div className="container pt-12 border-8 border-red-500">
      <Link to=".." relative="path">
        Notes overview
      </Link>
      <h2 className="text-h2">{noteId}</h2>
    </div>
  );
}
