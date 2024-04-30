import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { type Fetcher, Link, useFetcher, useLoaderData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	getUserImgSrc,
	invariantResponse,
	useDoubleCheck,
} from '#app/utils/misc.tsx'
import {
	EmailSchema,
	NameSchema,
	UsernameSchema,
} from '#app/utils/user-validation.ts'

const ProfileFormSchema = z.object({
	name: NameSchema.optional(),
	username: UsernameSchema,
	email: EmailSchema,
})

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			username: true,
			email: true,
			image: {
				select: { id: true },
			},
		},
	})

	invariantResponse(user, 'User not found', { status: 404 })

	return json({ user })
}

type ProfileActionArgs = {
	request: Request
	userId: string
	formData: FormData
}
const profileUpdateActionIntent = 'update-profile'
const deleteDataActionIntent = 'delete-data'

export async function action({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const intent = formData.get('intent')
	switch (intent) {
		case profileUpdateActionIntent: {
			return profileUpdateAction({ request, userId, formData })
		}
		case deleteDataActionIntent: {
			return deleteDataAction({ request, userId, formData })
		}
		default: {
			throw new Response(`Invalid intent "${intent}"`, { status: 400 })
		}
	}
}

export default function EditUserProfile() {
	const data = useLoaderData<typeof loader>()

	return (
		<div className="flex flex-col gap-12">
			<div className="flex justify-center">
				<div className="relative h-52 w-52">
					<img
						src={getUserImgSrc(data.user.image?.id)}
						alt={data.user.username}
						className="h-full w-full rounded-full object-cover"
					/>
					<Button
						asChild
						variant="outline"
						className="absolute -right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full p-0"
					>
						<Link
							preventScrollReset
							to="photo"
							title="Change profile photo"
							aria-label="Change profile photo"
						>
							<Icon name="camera" className="h-4 w-4" />
						</Link>
					</Button>
				</div>
			</div>
			<UpdateProfile />

			<div className="col-span-6 my-6 h-1 border-b-[1.5px] border-foreground" />
			<div className="col-span-full flex flex-col gap-6">
				<div>
					<Link to="password">
						<Icon name="dots-horizontal">Change Password</Icon>
					</Link>
				</div>
				<div>
					<a
						download="my-epic-notes-data.json"
						href="/resources/download-user-data"
					>
						<Icon name="download">Download your data</Icon>
					</a>
				</div>
				<DeleteData />
			</div>
		</div>
	)
}

async function profileUpdateAction({ userId, formData }: ProfileActionArgs) {
	const submission = await parseWithZod(formData, {
		async: true,
		schema: ProfileFormSchema.superRefine(async ({ email, username }, ctx) => {
			const existingUsername = await prisma.user.findUnique({
				where: { username },
				select: { id: true },
			})
			if (existingUsername && existingUsername.id !== userId) {
				ctx.addIssue({
					path: ['username'],
					code: 'custom',
					message: 'A user already exists with this username',
				})
			}
			const existingEmail = await prisma.user.findUnique({
				where: { email },
				select: { id: true },
			})
			if (existingEmail && existingEmail.id !== userId) {
				ctx.addIssue({
					path: ['email'],
					code: 'custom',
					message: 'A user already exists with this email',
				})
			}
		}),
	})
	if (submission.status !== 'success') {
		return json(submission.reply())
	}
	if (!submission.value) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	const data = submission.value

	await prisma.user.update({
		select: { username: true },
		where: { id: userId },
		data: {
			name: data.name,
			username: data.username,
			email: data.email,
		},
	})

	return json({ status: 'success', submission } as const)
}

const returnPossibleFormValue = (fetcher: Fetcher, fieldName: string) =>
	(fetcher.formData ? fetcher.formData.get(fieldName) : '') as string

function UpdateProfile() {
	const data = useLoaderData<typeof loader>()

	const fetcher = useFetcher<typeof profileUpdateAction>()

	const username =
		returnPossibleFormValue(fetcher, 'username') || data.user.username
	const name = returnPossibleFormValue(fetcher, 'name') || data.user.name
	const email = returnPossibleFormValue(fetcher, 'email') || data.user.email

	const [form, fields] = useForm({
		id: 'edit-profile',
		constraint: getZodConstraint(ProfileFormSchema),
		lastResult: fetcher.data,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ProfileFormSchema })
		},
		defaultValue: {
			username,
			name: name ?? '',
			email,
		},
	})

	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			<AuthenticityTokenInput />
			<div className="grid grid-cols-6 gap-x-10">
				<Field
					className="col-span-3"
					labelProps={{
						htmlFor: fields.username.id,
						children: 'Username',
					}}
					inputProps={{
						...getInputProps(fields.username, { type: 'text' }),
					}}
					errors={fields.username.errors}
				/>
				<Field
					className="col-span-3"
					labelProps={{ htmlFor: fields.name.id, children: 'Name' }}
					inputProps={{ ...getInputProps(fields.name, { type: 'text' }) }}
					errors={fields.name.errors}
				/>
				<Field
					className="col-span-3"
					labelProps={{ htmlFor: fields.email.id, children: 'Email' }}
					inputProps={{ ...getInputProps(fields.email, { type: 'email' }) }}
					errors={fields.email.errors}
				/>
			</div>

			<ErrorList errors={form.errors} id={form.errorId} />

			<div className="mt-8 flex justify-center">
				<StatusButton
					type="submit"
					size="wide"
					name="intent"
					value={profileUpdateActionIntent}
					status={
						fetcher.state !== 'idle'
							? 'pending'
							: fetcher.data?.status ?? 'idle'
					}
				>
					Save changes
				</StatusButton>
			</div>
		</fetcher.Form>
	)
}

async function deleteDataAction({ userId }: ProfileActionArgs) {
	await prisma.user.delete({ where: { id: userId } })
	return redirect('/')
}

function DeleteData() {
	const dc = useDoubleCheck()

	const fetcher = useFetcher<typeof deleteDataAction>()
	return (
		<div>
			<fetcher.Form method="POST">
				<AuthenticityTokenInput />
				<StatusButton
					{...dc.getButtonProps({
						type: 'submit',
						name: 'intent',
						value: deleteDataActionIntent,
					})}
					variant={dc.doubleCheck ? 'destructive' : 'default'}
					status={fetcher.state !== 'idle' ? 'pending' : 'idle'}
				>
					<Icon name="trash">
						{dc.doubleCheck ? `Are you sure?` : `Delete all your data`}
					</Icon>
				</StatusButton>
			</fetcher.Form>
		</div>
	)
}