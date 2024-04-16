import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { createId as cuid } from '@paralleldrive/cuid2'
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
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { floatingToolbarClassName } from '#app/components/floating-toolbar.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { ImageChooser } from '#app/components/ui/image-chooser.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { invariantResponse } from '#app/utils/misc.tsx'

const MIN_TITLE_LENGTH = 1
const MAX_TITLE_LENGTH = 100
const MIN_CONTENT_LENGTH = 1
const MAX_CONTENT_LENGTH = 10000
const MAX_UPLOAD_SIZE = 1024 * 1024 * 3

export const ImageFieldsetSchema = z.object({
	id: z.string().optional(),
	altText: z.string().optional(),
	file: z
		.instanceof(File)
		.optional()
		.refine(file => file && file.size < MAX_UPLOAD_SIZE, 'File too large'),
})

type ImageFieldset = z.infer<typeof ImageFieldsetSchema>

function imageHasFile(
	image: ImageFieldset,
): image is ImageFieldset & { file: NonNullable<ImageFieldset['file']> } {
	return Boolean(image.file?.size && image.file?.size > 0)
}

function imageHasId(
	image: ImageFieldset,
): image is ImageFieldset & { id: NonNullable<ImageFieldset['id']> } {
	return image.id != null
}

const NoteEditorSchema = z.object({
	title: z.string().min(MIN_TITLE_LENGTH).max(MAX_TITLE_LENGTH),
	content: z.string().min(MIN_CONTENT_LENGTH).max(MAX_CONTENT_LENGTH),
	images: z.array(ImageFieldsetSchema).max(5).optional(),
})

export async function loader({ params }: LoaderFunctionArgs) {
	const note = await prisma.note.findFirst({
		where: { id: params.noteId },
		select: {
			title: true,
			content: true,
			images: {
				select: { id: true, altText: true },
			},
		},
	})

	invariantResponse(note, 'Note not found', { status: 404 })

	return json({
		note,
	})
}

export async function action(
	args: Pick<ActionFunctionArgs, 'request' | 'params'>,
): Promise<Response> {
	const { request, params } = args
	const { noteId, username } = params

	invariantResponse(noteId, 'Invalid note ID')

	const formData = await parseMultipartFormData(
		request,
		createMemoryUploadHandler({ maxPartSize: MAX_UPLOAD_SIZE }),
	)

	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: NoteEditorSchema.transform(async ({ images = [], ...data }) => {
			return {
				...data,
				imageUpdates: await Promise.all(
					images.filter(imageHasId).map(async i => {
						if (imageHasFile(i)) {
							return {
								id: i.id,
								altText: i.altText,
								contentType: i.file.type,
								blob: Buffer.from(await i.file.arrayBuffer()),
							}
						} else {
							return { id: i.id, altText: i.altText }
						}
					}),
				),
				newImages: await Promise.all(
					images
						.filter(imageHasFile)
						.filter(i => !i.id)
						.map(async image => {
							return {
								altText: image.altText,
								contentType: image.file.type,
								blob: Buffer.from(await image.file.arrayBuffer()),
							}
						}),
				),
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return json(submission.reply())
	}

	const { title, content, imageUpdates = [], newImages = [] } = submission.value

	await prisma.note.update({
		select: { id: true },
		where: { id: noteId },
		data: {
			title,
			content,
			images: {
				deleteMany: { id: { notIn: imageUpdates.map(i => i.id) } },
				updateMany: imageUpdates.map(update => ({
					where: { id: update.id },
					data: { ...update, id: update.blob ? cuid() : update.id },
				})),
				create: newImages,
			},
		},
	})

	return redirect(`/users/${username}/notes/${noteId}`)
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
			images: data.note.images?.length ? data.note.images : [{}],
		},
	})

	const imageList = fields.images.getFieldList()

	const isPending =
		navigation.state !== 'idle' &&
		navigation.formAction === formAction &&
		navigation.formMethod === 'POST'

	return (
		<div className="absolute inset-0">
			<Form
				method="POST"
				className="flex h-full flex-col gap-y-4 overflow-y-auto overflow-x-hidden px-10 pb-28 pt-12"
				{...getFormProps(form)}
				encType="multipart/form-data"
			>
				<AuthenticityTokenInput />

				<button type="submit" className="hidden" />
				<div className="flex flex-col gap-1">
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
					<Label>Images</Label>
					<ul className="flex flex-col gap-4">
						{imageList.map((image, index) => (
							<li
								className="relative border-b-2 border-muted-foreground pb-4"
								key={image.key}
							>
								<button
									{...form.remove.getButtonProps({
										name: fields.images.name,
										index,
									})}
									className="absolute top-0 right-0 text-destructive"
								>
									<span className="sr-only">Delete image {index + 1}</span>
									<span aria-hidden>❌</span>
								</button>
								<ImageChooser config={image} />
							</li>
						))}
					</ul>
				</div>
				<Button {...form.insert.getButtonProps({ name: fields.images.name })}>
					<span className="sr-only">Add image</span>
					<span aria-hidden>➕ Image</span>
				</Button>

				<div className={floatingToolbarClassName}>
					<Button
						form={form.id}
						type="reset"
						variant="destructive"
						className="mr-2"
						disabled={isPending}
					>
						Reset Form
					</Button>
					<StatusButton
						form={form.id}
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
