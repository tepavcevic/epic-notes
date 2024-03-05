import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
import {
	Form,
	useFormAction,
	useLoaderData,
	useNavigation,
} from '@remix-run/react'
import { db } from '#app/utils/db.server.ts'
import { invariantResponse } from '#app/utils/misc.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { floatingToolbarClassName } from '#app/components/floating-toolbar.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'

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
	const title = formData.get('title')
	const content = formData.get('content')

	invariantResponse(typeof title === 'string', 'Title must be a string')
	invariantResponse(typeof content === 'string', 'Content must be a string')

	const note = db.note.update({
		where: {
			id: {
				equals: params.noteId,
			},
		},
		data: {
			title,
			content,
		},
	})

	return redirect(`/users/${params.username}/notes/${params.noteId}`)
}

export default function NoteEdit() {
	const data = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const formAction = useFormAction()

	const isPending =
		navigation.state !== 'idle' &&
		navigation.formAction === formAction &&
		navigation.formMethod === 'POST'

	return (
		<Form method="POST" className="flex flex-col gap-4 p-12">
			<div>
				<Label htmlFor="title">Title</Label>
				<Input
					id="title"
					name="title"
					defaultValue={data.note.title}
					disabled={isPending}
				/>
			</div>
			<div>
				<Label htmlFor="content">Content</Label>
				<Textarea
					id="content"
					name="content"
					defaultValue={data.note.content}
					disabled={isPending}
				/>
			</div>
			<div className={floatingToolbarClassName}>
				<Button type="reset" className="mr-2 bg-red-700" disabled={isPending}>
					Reset Form
				</Button>
				<StatusButton
					status={isPending ? 'pending' : 'idle'}
					type="submit"
					disabled={isPending}
				>
					Submit
				</StatusButton>
			</div>
		</Form>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ params }) => <p>Note {params.noteId} not found</p>,
			}}
		/>
	)
}
