import { Outlet } from "@remix-run/react";

export default function NotesRoute() {
  return (
    <div>
      NotesRoute
      <Outlet />
    </div>
  );
}
