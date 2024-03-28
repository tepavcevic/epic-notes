import {
	type LoaderFunctionArgs,
	json,
	redirect,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { Form, Link, type MetaFunction, useLoaderData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { CSRFError } from 'remix-utils/csrf/server'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { floatingToolbarClassName } from '#app/components/floating-toolbar.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { csrf } from '#app/utils/csrf.server.ts'
import { db } from '#app/utils/db.server.ts'
import { invariantResponse } from '../../../utils/misc.tsx'
import { type loader as noteLoader } from './notes.tsx'

export async function loader({ params }: LoaderFunctionArgs) {
	const note = db.note.findFirst({
		where: {
			id: {
				equals: params.noteId,
			},
		},
	})

	invariantResponse(note, 'Note not found.', { status: 404 })

	return json({ note })
}

export async function action({ request, params }: ActionFunctionArgs) {
	const formData = await request.formData()
	try {
		await csrf.validate(formData, request.headers)
	} catch (error) {
		if (error instanceof CSRFError) {
			throw new Response('Invalid CSRF token', { status: 403 })
		}
		throw error
	}

	const intent = formData.get('intent')

	switch (intent) {
		case 'delete': {
			db.note.delete({ where: { id: { equals: params.noteId } } })
			return redirect(`/users/${params.username}/notes`)
		}

		default:
			throw new Response(`Bad request - intent: ${intent}`, { status: 400 })
	}
}

export default function NoteIdRoute() {
	const data = useLoaderData<typeof loader>()

	return (
		<div className="absolute inset-0 flex flex-col px-10">
			<h2 className="mb-2 pt-12 text-h2 lg:mb-6">{data.note?.title}</h2>
			<div className="overflow-y-auto pb-24">
				<ul className="flex flex-wrap gap-5 py-5">
					{data.note.images.map(image => (
						<li key={image.id}>
							<a href={`/resources/images/${image.id}`}>
								<img
									src={`/resources/images/${image.id}`}
									alt={image.altText ?? ''}
									className="h-32 w-32 rounded-lg object-cover"
								/>
							</a>
						</li>
					))}
				</ul>
				<p className="whitespace-break-spaces text-sm md:text-lg">
					{data.note.content}
				</p>
			</div>
			<div className={floatingToolbarClassName}>
				<Form method="POST">
					<AuthenticityTokenInput />
					<Button
						name="intent"
						value="delete"
						type="submit"
						variant="destructive"
					>
						Delete
					</Button>
				</Form>
				<Button asChild>
					<Link to="edit">Edit</Link>
				</Button>
			</div>
		</div>
	)
}

export const meta: MetaFunction<
	typeof loader,
	{ 'routes/users+/$username_+/notes': typeof noteLoader }
> = ({ data, params, matches }) => {
	const notesMatch = matches.find(
		m => m.id === 'routes/users+/$username_+/notes',
	)
	const displayName = notesMatch?.data?.owner.name ?? params.username
	const noteTitle = data?.note.title ?? 'Note'
	const noteContentsSummary =
		data && data.note.content.length > 100
			? data?.note.content.slice(0, 97) + '...'
			: data?.note.content
	return [
		{ title: `${noteTitle} | ${displayName}'s Notes | Epic Notes` },
		{
			name: 'description',
			content: noteContentsSummary,
		},
	]
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
