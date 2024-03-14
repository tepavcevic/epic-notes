import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	json,
	redirect,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
	unstable_parseMultipartFormData as parseMultipartFormData,
	unstable_createMemoryUploadHandler as createMemoryUploadHandler,
} from '@remix-run/node'
import {
	Form,
	useActionData,
	useFormAction,
	useLoaderData,
	useNavigation,
} from '@remix-run/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { floatingToolbarClassName } from '#app/components/floating-toolbar.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { ImageChooser } from '#app/components/ui/image-chooser.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { db } from '#app/utils/db.server.ts'
import { invariantResponse } from '#app/utils/misc.tsx'

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
		.string({ required_error: 'Title is required' })
		.min(1, 'Title is required')
		.max(
			MAX_TITLE_LENGTH,
			`Title must be less than ${MAX_TITLE_LENGTH} characters`,
		),
	content: z
		.string({ required_error: 'Content is required' })
		.min(1, 'Content is required')
		.max(
			MAX_CONTENT_LENGTH,
			`Content must be less than ${MAX_CONTENT_LENGTH} characters`,
		),
})

export async function action(
	args: Pick<ActionFunctionArgs, 'request' | 'params'>,
): Promise<Response> {
	const { request, params } = args
	invariantResponse(params.noteId, 'Invalid note ID')

	const formData = await parseMultipartFormData(
		request,
		createMemoryUploadHandler({ maxPartSize: 1024 * 1024 * 3 }),
	)

	const submission = parseWithZod(formData, { schema: NoteEditorSchema })

	if (submission.status !== 'success') {
		return json({ status: 'error', submission }, { status: 400 })
	}

	const { title, content } = submission.value

	db.note.update({
		where: {
			id: {
				equals: params.noteId,
			},
		},
		data: {
			title,
			content,
			images: [
				{
					id: formData.get('imageId') ?? '',
					file: formData.get('file') ?? null,
					altText: formData.get('altText') ?? null,
				},
			],
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

export default function NoteEdit() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const formAction = useFormAction()
	const formId = 'note-form-editor'

	const [form, fields] = useForm({
		id: formId,
		lastResult: actionData?.submission,
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		constraint: getZodConstraint(NoteEditorSchema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: NoteEditorSchema })
		},
		defaultValue: {
			title: data.note.title,
			content: data.note.content,
		},
	})

	console.log(data)

	const isPending =
		navigation.state !== 'idle' &&
		navigation.formAction === formAction &&
		navigation.formMethod === 'POST'

	return (
		<div className="absolute inset-0">
			<Form
				method="POST"
				className="flex flex-col gap-4 p-12"
				{...getFormProps(form)}
				encType="multipart/form-data"
			>
				<div>
					<Label htmlFor={fields.title.id}>Title</Label>
					<Input
						{...getInputProps(fields.title, { type: 'text' })}
						disabled={isPending}
						maxLength={MAX_TITLE_LENGTH}
						autoFocus
						autoComplete="off"
						autoCorrect="off"
					/>
					<div className="min-h-[32px] px-4 pt-1 pb-3">
						<ErrorList
							errors={fields?.title.errors}
							id={fields.title.errorId}
						/>
					</div>
				</div>

				<div>
					<Label id={fields.content.id}>Content</Label>
					<Textarea
						{...getInputProps(fields.content, { type: 'text' })}
						disabled={isPending}
						maxLength={MAX_CONTENT_LENGTH}
						autoComplete="off"
						autoCorrect="off"
					/>
					<div className="min-h-[32px] px-4 pt-1 pb-3">
						<ErrorList
							errors={fields?.content.errors}
							id={fields.content.errorId}
						/>
					</div>
				</div>

				<div>
					<Label>Image</Label>
					<ImageChooser image={data.note.images[0]} />
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
					<ErrorList errors={form?.errors} id={form.id} />
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
