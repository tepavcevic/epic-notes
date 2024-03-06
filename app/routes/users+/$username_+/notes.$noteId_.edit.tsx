import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
import {
	Form,
	useActionData,
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

const MAX_TITLE_LENGTH = 100
const MAX_CONTENT_LENGTH = 10000

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

	const errors = {
		formErrors: [] as Array<string>,
		fieldErrors: {
			title: [] as Array<string>,
			content: [] as Array<string>,
		},
	}

	if (title === '') {
		errors.fieldErrors.title.push('Title is required')
	}
	if (title && title.toString()?.length > MAX_TITLE_LENGTH) {
		errors.fieldErrors.title.push(
			`Title must be less than ${MAX_TITLE_LENGTH} characters`,
		)
	}
	if (content === '') {
		errors.fieldErrors.content.push('Content is required')
	}
	if (content && content.toString()?.length > MAX_CONTENT_LENGTH) {
		errors.fieldErrors.content.push(
			`Content must be less than ${MAX_CONTENT_LENGTH} characters`,
		)
	}

	const hasErrors =
		Object.values(errors.fieldErrors).some(
			fieldErrors => fieldErrors.length > 0,
		) || errors.formErrors.length > 0

	if (hasErrors) {
		return json({ status: 'error', errors } as const, { status: 400 })
	}

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

function ErrorList({ errors }: { errors?: Array<string> | null }) {
	return errors?.length ? (
		<ul className="flex flex-col gap-1">
			{errors.map(error => (
				<li key={error} className="text-[10px] text-destructive">
					{error}
				</li>
			))}
		</ul>
	) : null
}

export default function NoteEdit() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const formAction = useFormAction()
	const formId = 'form-editor'

	const fieldErrors =
		actionData?.status === 'error' ? actionData?.errors?.fieldErrors : null
	const formErrors =
		actionData?.status === 'error' ? actionData?.errors?.formErrors : null

	const isPending =
		navigation.state !== 'idle' &&
		navigation.formAction === formAction &&
		navigation.formMethod === 'POST'

	return (
		<div className="absolute inset-0">
			<Form
				id={formId}
				method="POST"
				className="flex flex-col gap-4 p-12"
				noValidate
			>
				<div>
					<Label htmlFor="title">Title</Label>
					<Input
						id="title"
						name="title"
						defaultValue={data.note.title}
						disabled={isPending}
						required
						maxLength={MAX_TITLE_LENGTH}
						autoComplete="off"
						autoCorrect="off"
					/>
					<div className="min-h-[32px] px-4 pt-1 pb-3">
						<ErrorList errors={fieldErrors?.title} />
					</div>
				</div>
				<div>
					<Label htmlFor="content">Content</Label>
					<Textarea
						id="content"
						name="content"
						defaultValue={data.note.content}
						disabled={isPending}
						required
						maxLength={MAX_CONTENT_LENGTH}
						autoComplete="off"
						autoCorrect="off"
					/>
					<div className="min-h-[32px] px-4 pt-1 pb-3">
						<ErrorList errors={fieldErrors?.content} />
					</div>
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
				<div className="min-h-[32px] px-4 pt-1 pb-3">
					<ErrorList errors={formErrors} />
				</div>
			</Form>
		</div>
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
