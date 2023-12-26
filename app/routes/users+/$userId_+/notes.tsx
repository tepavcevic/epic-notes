import { Link, NavLink, Outlet } from "@remix-run/react";

export default function NotesRoute() {
  return (
    <div className="flex h-full justify-between pb-12 border-8 border-blue-500">
      <h1 className="text-h1">Notes</h1>

      <ul>
        <li>
          <Link to=".." relative="path">
            Back to user
          </Link>
        </li>
        <li>
          <NavLink
            to="some-note-id"
            className={({ isActive }) =>
              `underline ${isActive ? "bg-accent" : ""}`
            }
          >
            Some note
          </NavLink>
        </li>
      </ul>
      <Outlet />
    </div>
  );
}
