import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { Form, useLoaderData } from '@remix-run/react'
import { db } from '#app/utils/db.server.ts'
import { invariantResponse } from '#app/utils/misc.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { floatingToolbarClassName } from '#app/components/floating-toolbar.tsx'

export async function loader({ params }: LoaderFunctionArgs) {
	const note = db.note.findFirst({
		where: {
			id: {
				equals: params.noteId,
			},
		},
	})

	invariantResponse(note, 'Note not found', { status: 404 })

	return json({
		note,
	})
}

export async function action({ request, params }: LoaderFunctionArgs) {
  const formData = await request.formData()
  const note = db.note.update({
    where: {
      id: {
        equals: params.noteId,
      },
    },
    data: {
      title: formData.get('title')?.toString(),
      content: formData.get('content')?.toString(),
    },
  })

  return redirect(`/users/${params.username}/notes/${params.noteId}`);
}

export default function NoteEdit() {
	const data = useLoaderData<typeof loader>()

	return (
    <div className='flex flex-col p-12'>
      <Form method="POST">
        <div className='mb-4'>
          <Label htmlFor='title'>Title</Label>
          <Input id='title' name="title" defaultValue={data.note.title} />
        </div>
        <div>
          <Label htmlFor='content'>Content</Label>
          <Textarea id="content" name="content" defaultValue={data.note.content} />
        </div>
        <div className={floatingToolbarClassName}>
          <Button type='reset' className='mr-2 bg-red-700'>Reset Form</Button>
          <Button type='submit'>Submit</Button>
        </div>
      </Form>
    </div>
  );
}