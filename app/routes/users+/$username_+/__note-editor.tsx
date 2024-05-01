import {
	getFormProps,
	useForm,
	getInputProps,
	getTextareaProps,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { createId as cuid } from '@paralleldrive/cuid2'
import { type Note, type NoteImage } from '@prisma/client'
import {
	unstable_createMemoryUploadHandler as createMemoryUploadHandler,
	json,
	unstable_parseMultipartFormData as parseMultipartFormData,
	redirect,
	type ActionFunctionArgs,
	type SerializeFrom,
} from '@remix-run/node'
import { Form, useActionData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { floatingToolbarClassName } from '#app/components/floating-toolbar.tsx'
import { ErrorList, Field, TextareaField } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { ImageChooser } from '#app/components/ui/image-chooser.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUser } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { invariantResponse, useIsPending } from '#app/utils/misc.tsx'

const titleMinLength = 1
const titleMaxLength = 100
const contentMinLength = 1
const contentMaxLength = 10000

const MAX_UPLOAD_SIZE = 1024 * 1024 * 3 // 3MB

export const ImageFieldsetSchema = z.object({
	id: z.string().optional(),
	file: z
		.instanceof(File)
		.optional()
		.refine(file => {
			return !file || file.size <= MAX_UPLOAD_SIZE
		}, 'File size must be less than 3MB'),
	altText: z.string().optional(),
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
	id: z.string().optional(),
	title: z.string().min(titleMinLength).max(titleMaxLength),
	content: z.string().min(contentMinLength).max(contentMaxLength),
	images: z.array(ImageFieldsetSchema).max(5).optional(),
})

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUser(request)
	invariantResponse(params.username === user.username, 'Unauthorized', {
		status: 403,
	})

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

	if (!submission.value) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	const {
		id: noteId,
		title,
		content,
		imageUpdates = [],
		newImages = [],
	} = submission.value

	const updatedNote = await prisma.note.upsert({
		select: { id: true, owner: { select: { username: true } } },
		where: { id: noteId ?? '__new_note__' },
		create: {
			owner: { connect: { username: params.username } },
			title,
			content,
			images: { create: newImages },
		},
		update: {
			title,
			content,
			images: {
				deleteMany: { id: { notIn: imageUpdates.map(i => i.id) } },
				updateMany: imageUpdates.map(updates => ({
					where: { id: updates.id },
					data: { ...updates, id: updates.blob ? cuid() : updates.id },
				})),
				create: newImages,
			},
		},
	})

	return redirect(
		`/users/${updatedNote.owner.username}/notes/${updatedNote.id}`,
	)
}

export function NoteEditor({
	note,
}: {
	note?: SerializeFrom<
		Pick<Note, 'id' | 'title' | 'content'> & {
			images: Array<Pick<NoteImage, 'id' | 'altText'>>
		}
	>
}) {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'note-editor',
		lastResult: actionData,
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		constraint: getZodConstraint(NoteEditorSchema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: NoteEditorSchema })
		},
		defaultValue: {
			title: note?.title ?? '',
			content: note?.content ?? '',
			images: note?.images?.length ? note.images : [{}],
		},
	})

	const imageList = fields.images.getFieldList()

	imageList.map(image => console.log(image.value))

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
				{note ? <input type="hidden" name="id" value={note.id} /> : null}
				<div className="flex flex-col gap-1">
					<Field
						labelProps={{ children: 'Title' }}
						inputProps={{
							autoFocus: true,
							...getInputProps(fields.title, { type: 'text' }),
						}}
						errors={fields.title.errors}
					/>
					<TextareaField
						labelProps={{ children: 'Content' }}
						textareaProps={{
							...getTextareaProps(fields.content),
						}}
						errors={fields.content.errors}
					/>
					<div>
						<Label>Images</Label>
						<ul className="flex flex-col gap-4">
							{imageList.map((image, index) => (
								<li
									className="relative border-b-2 border-muted-foreground pb-4"
									key={image.key}
								>
									<button
										className="text-foreground-destructive absolute right-0 top-0"
										{...form.remove.getButtonProps({
											name: fields.images.name,
											index,
										})}
									>
										<span aria-hidden>
											<Icon name="cross-1" />
										</span>{' '}
										<span className="sr-only">Remove image {index + 1}</span>
									</button>
									<ImageChooser config={image} />
								</li>
							))}
						</ul>
					</div>
					<Button
						className="mt-3"
						{...form.insert.getButtonProps({ name: fields.images.name })}
					>
						<span aria-hidden>
							<Icon name="plus">Image</Icon>
						</span>{' '}
						<span className="sr-only">Add image</span>
					</Button>
				</div>
				<ErrorList id={form.errorId} errors={form.errors} />
			</Form>
			<div className={floatingToolbarClassName}>
				<Button form={form.id} variant="destructive" type="reset">
					Reset
				</Button>
				<StatusButton
					form={form.id}
					type="submit"
					disabled={isPending}
					status={isPending ? 'pending' : 'idle'}
				>
					Submit
				</StatusButton>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ params }) => (
					<p>No note with the id "{params.noteId}" exists</p>
				),
			}}
		/>
	)
}
