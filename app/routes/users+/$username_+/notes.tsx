import { Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import { db } from "#app/utils/db.server.ts";

export async function loader() {
  //should validate owner after db query as well ad notes

  const notes = db.note.findMany({});

  return json({
    ownerDisplayName: "Kody",
    notes: notes.map((note) => ({ id: note.id, title: note.title })),
  });
}

export default function NotesRoute() {
  const { ownerDisplayName, notes } = useLoaderData<typeof loader>();
  const navLinkDefaultClassName =
    "line-clamp-2 block rounded-l-full py-2 pl-8 pr-6 text-base lg:text-xl";

  return (
    <main className="container flex h-full min-h-[400px] pb-12 px-0 md:px-8">
      <div className="grid w-full grid-cols-4 bg-muted pl-2 md:container md:mx-2 md:rounded-3xl md:pr-0">
        <div className="relative col-span-1">
          <div className="absolute inset-0 flex flex-col">
            <Link to=".." relative="path" className="pb-4 pl-8 pr-4 pt-12">
              <h1 className="text-base font-bold md:text-lg lg:text-left lg:text-2xl">
                {ownerDisplayName}&apos;s Notes
              </h1>
            </Link>
            <ul className="overflow-y-auto overflow-x-hidden pb-12">
              {notes.map((note) => (
                <li className="p-1 pr-0" key={note.id}>
                  <NavLink
                    to={note.id}
                    className={({ isActive }) =>
                      `${navLinkDefaultClassName} ${
                        isActive ? "bg-accent" : ""
                      }`
                    }
                  >
                    {note.title}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="relative col-span-3 bg-accent md:rounded-r-3xl">
          <Outlet />
        </div>
      </div>
    </main>
  );
}
