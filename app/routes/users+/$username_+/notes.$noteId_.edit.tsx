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
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'

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

const NoteEditorSchema = z.object({
	title: z
		.string()
		.min(1, 'Title is required')
		.max(
			MAX_TITLE_LENGTH,
			`Title must be less than ${MAX_TITLE_LENGTH} characters`,
		),
	content: z
		.string()
		.min(1, 'Content is required')
		.max(
			MAX_CONTENT_LENGTH,
			`Content must be less than ${MAX_CONTENT_LENGTH} characters`,
		),
})

export async function action({ request, params }: LoaderFunctionArgs) {
	const formData = await request.formData()
	const result = NoteEditorSchema.safeParse({
		title: formData.get('title'),
		content: formData.get('content'),
	})

	if (!result.success) {
		return json(
			{ status: 'error', errors: result.error.flatten() },
			{ status: 400 },
		)
	}

	const { title, content } = result.data

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

function ErrorList({
	errors,
	id,
}: {
	errors?: Array<string> | null
	id?: string
}) {
	return errors?.length ? (
		<ul className="flex flex-col gap-1" id={id}>
			{errors.map(error => (
				<li key={error} className="text-[10px] text-destructive">
					{error}
				</li>
			))}
		</ul>
	) : null
}

function useHydrated() {
	const [hydrated, setHydrated] = useState(false)
	useEffect(() => {
		setHydrated(true)
	}, [])
	return hydrated
}

export default function NoteEdit() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const formAction = useFormAction()
	const isHydrated = useHydrated()
	const formId = 'form-editor'
	const formRef = useRef<HTMLFormElement>(null)

	const fieldErrors =
		actionData?.status === 'error' ? actionData?.errors?.fieldErrors : null
	const formErrors =
		actionData?.status === 'error' ? actionData?.errors?.formErrors : null

	const isTitleError = Boolean(fieldErrors?.title?.length)
	const titleErrorId = isTitleError ? 'title-error' : undefined
	const isContentError = Boolean(fieldErrors?.content?.length)
	const contentErrorId = isContentError ? 'content-error' : undefined
	const isFormError = Boolean(formErrors?.length)
	const formErrorId = isFormError ? 'form-error' : undefined

	const isPending =
		navigation.state !== 'idle' &&
		navigation.formAction === formAction &&
		navigation.formMethod === 'POST'

	useEffect(() => {
		const formEl = formRef.current
		if (!formEl) {
			return
		}
		if (actionData?.status !== 'error') {
			return
		}
		if (formEl.matches('[aria-invalid="true"]')) {
			formEl.focus()
		} else {
			const firstInvalidField = formEl.querySelector('[aria-invalid="true"]')
			if (firstInvalidField instanceof HTMLElement) {
				firstInvalidField.focus()
			}
		}
	}, [])

	return (
		<div className="absolute inset-0">
			<Form
				id={formId}
				method="POST"
				className="flex flex-col gap-4 p-12"
				noValidate={isHydrated}
				aria-invalid={isFormError || undefined}
				aria-describedby={formErrorId}
				ref={formRef}
				tabIndex={-1}
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
						autoFocus
						autoComplete="off"
						autoCorrect="off"
						aria-invalid={isTitleError || undefined}
						aria-describedby={titleErrorId}
					/>
					<div className="min-h-[32px] px-4 pt-1 pb-3">
						<ErrorList errors={fieldErrors?.title} id={titleErrorId} />
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
						aria-invalid={isContentError || undefined}
						aria-describedby={contentErrorId}
					/>
					<div className="min-h-[32px] px-4 pt-1 pb-3">
						<ErrorList errors={fieldErrors?.content} id={contentErrorId} />
					</div>
				</div>
				<div className={floatingToolbarClassName}>
					<Button
						form={formId}
						type="reset"
						variant="destructive"
						className="mr-2"
						disabled={isPending}
					>
						Reset Form
					</Button>
					<StatusButton
						form={formId}
						status={isPending ? 'pending' : 'idle'}
						type="submit"
						disabled={isPending}
					>
						Submit
					</StatusButton>
				</div>
				<div className="min-h-[32px] px-4 pt-1 pb-3">
					<ErrorList errors={formErrors} id={formErrorId} />
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
