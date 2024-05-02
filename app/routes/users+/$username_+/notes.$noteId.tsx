import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	type LoaderFunctionArgs,
	json,
	redirect,
	type ActionFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	type MetaFunction,
	useLoaderData,
	useActionData,
} from '@remix-run/react'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { floatingToolbarClassName } from '#app/components/floating-toolbar.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUser } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	getNoteImgSrc,
	invariantResponse,
	useIsPending,
} from '#app/utils/misc.tsx'
import {
	requireUserWithPermission,
	userHasPermission,
} from '#app/utils/permissions.ts'
import { toastSessionStorage } from '#app/utils/toast.server.ts'
import { useOptionalUser } from '#app/utils/user.ts'
import { type loader as noteLoader } from './notes.tsx'

const DeleteNoteSchema = z.object({
	intent: z.literal('delete-note'),
	noteId: z.string(),
})

export async function loader({ params }: LoaderFunctionArgs) {
	const note = await prisma.note.findUnique({
		where: { id: params.noteId },
		select: {
			id: true,
			title: true,
			content: true,
			ownerId: true,
			updatedAt: true,
			images: { select: { id: true, altText: true } },
		},
	})

	invariantResponse(note, 'Note not found.', { status: 404 })

	const date = new Date(note.updatedAt)
	const timeAgo = formatDistanceToNow(date)

	return json({ note, timeAgo })
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUser(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	const submission = parseWithZod(formData, { schema: DeleteNoteSchema })

	if (submission.status !== 'success') {
		return json(submission.reply())
	}

	if (!submission.value) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	const { noteId } = submission.value

	const note = await prisma.note.findFirst({
		select: { id: true, ownerId: true, owner: { select: { username: true } } },
		where: { id: noteId },
	})
	invariantResponse(note, 'Not found', { status: 404 })

	const isOwner = user.id === note.ownerId
	await requireUserWithPermission(
		request,
		isOwner ? 'delete:note:own' : 'delete:note:any',
	)

	await prisma.note.delete({ where: { id: noteId } })

	const cookie = request.headers.get('cookie')
	const toastCookieSession = await toastSessionStorage.getSession(cookie)
	toastCookieSession.flash('toast', {
		type: 'success',
		title: 'Note deleted',
		description: 'Your note has been deleted',
	})

	return redirect(`/users/${note.owner.username}/notes`, {
		headers: {
			'set-cookie': await toastSessionStorage.commitSession(toastCookieSession),
		},
	})
}

export default function NoteIdRoute() {
	const data = useLoaderData<typeof loader>()
	const user = useOptionalUser()
	const isOwner = user?.id === data.note.ownerId
	const canDelete = userHasPermission(
		user,
		isOwner ? 'delete:note:own' : 'delete:note:any',
	)
	const displayBar = canDelete || isOwner

	return (
		<div className="absolute inset-0 flex flex-col px-10">
			<h2 className="mb-2 pt-12 text-h2 lg:mb-6">{data.note?.title}</h2>
			<div className="overflow-y-auto pb-24">
				<ul className="flex flex-wrap gap-5 py-5">
					{data.note.images.map(image => (
						<li key={image.id}>
							<a href={getNoteImgSrc(image.id)}>
								<img
									src={getNoteImgSrc(image.id)}
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
			{displayBar && (
				<div className={floatingToolbarClassName}>
					<span className="text-sm text-foreground/90 max-[524px]:hidden">
						<Icon name="clock" className="scale-125">
							{data.timeAgo} ago
						</Icon>
					</span>
					<DeleteNote id={data.note.id} />
					<Button
						asChild
						className="min-[525px]:max-md:aspect-square min-[525px]:max-md:px-0"
					>
						<Link to="edit">
							<Icon name="pencil-1" className="scale-125 max-md:scale-150">
								<span className="max-md:hidden">Edit</span>
							</Icon>
						</Link>
					</Button>
				</div>
			)}
		</div>
	)
}

function DeleteNote({ id }: { id: string }) {
	const actionData = useActionData<any>()
	const isPending = useIsPending()
	const [form] = useForm({
		id: 'delete-note',
		lastResult: actionData,
		constraint: getZodConstraint(DeleteNoteSchema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: DeleteNoteSchema })
		},
	})

	return (
		<Form method="POST" {...getFormProps(form)}>
			<AuthenticityTokenInput />
			<input type="hidden" name="noteId" value={id} />
			<StatusButton
				type="submit"
				name="intent"
				value="delete-note"
				variant="destructive"
				status={isPending ? 'pending' : actionData?.status ?? 'idle'}
				disabled={isPending}
				className="w-full max-md:aspect-square max-md:px-0"
			>
				<Icon name="trash" className="scale-125 max-md:scale-150">
					<span className="max-md:hidden">Delete</span>
				</Icon>
			</StatusButton>
		</Form>
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
				403: () => <p>You do not have permission</p>,
				404: ({ params }) => <p>Note {params.noteId} not found</p>,
			}}
		/>
	)
}
