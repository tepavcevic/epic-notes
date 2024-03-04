import { LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { invariantResponse } from "../../../utils/misc.tsx";
import { floatingToolbarClassName } from "#app/components/floating-toolbar.tsx";
import { Button } from "#app/components/ui/button.tsx";
import { db } from "#app/utils/db.server.ts";

export async function loader({ params }: LoaderFunctionArgs) {
  const note = db.note.findFirst({
    where: {
      id: {
        equals: params.noteId,
      },
    },
  });

  invariantResponse(note, "Note not found.", { status: 404 });

  return json({ note });
}

export async function action({ request, params }: LoaderFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case 'delete': {
      db.note.delete({ where: { id: { equals: params.noteId } } });
      return redirect(`/users/${params.username}/notes`);
    }

    default:
      throw new Response(`Bad request - intent: ${intent}`, { status: 400 });
  }

}

export default function NoteIdRoute() {
  const { note } = useLoaderData<typeof loader>();

  return (
    <div className="absolute inset-0 flex flex-col px-10">
      <h2 className="mb-2 pt-12 text-h2 lg:mb-6">{note?.title}</h2>
      <div className="overflow-y-auto pb-24">
        <p className="whitespace-break-spaces text-sm md:text-lg">
          {note?.content}
        </p>
      </div>
      <div className={floatingToolbarClassName}>
      <Form method="POST">
        <Button name="intent" value="delete" type="submit" variant="destructive">Delete</Button>
      </Form>
				<Button asChild>
					<Link to="edit">Edit</Link>
				</Button>
			</div>
    </div>
  );
}
