import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import * as E from '@react-email/components'
import {
	type LoaderFunctionArgs,
	json,
	redirect,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { Form, useActionData, useLoaderData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { invariant, useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { EmailSchema } from '#app/utils/user-validation.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import {
	prepareVerification,
	targetQueryParam,
	type VerifyFunctionArgs,
} from '../_auth+/verify.tsx'

export const handle = {
	breadcrumb: <Icon name="envelope-closed">Change Email</Icon>,
}

export const newEmailAddressSessionKey = 'new-email-address'

export async function handleVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	invariant(
		submission.status === 'success',
		'you should really have the submission value by now',
	)

	const cookie = request.headers.get('cookie')
	const verifySession = await verifySessionStorage.getSession(cookie)
	const newEmail = verifySession.get(newEmailAddressSessionKey)

	if (!newEmail) {
		return json(
			submission.reply({
				formErrors: [
					'You must submit code on the same device that requested the change.',
				],
			}),
		)
	}

	const prevUser = await prisma.user.findFirstOrThrow({
		select: { email: true },
		where: { id: submission.value[targetQueryParam] },
	})

	const user = await prisma.user.update({
		select: { id: true, email: true },
		where: { id: submission.value[targetQueryParam] },
		data: { email: newEmail },
	})

	void sendEmail({
		to: prevUser?.email,
		subject: 'Email Change Notice',
		react: <EmailChangeNoticeEmail userId={user.id} />,
	})

	throw await redirectWithToast(
		'/settings/profile',
		{
			title: 'Email changed',
			description: `Email changed to ${user.email}`,
			type: 'success',
		},
		{
			headers: {
				'set-cookie': await verifySessionStorage.destroySession(verifySession),
			},
		},
	)
}

const ChangeEmailSchema = z.object({
	email: EmailSchema,
})

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		select: { email: true },
		where: { id: userId },
	})

	if (!user) {
		const params = new URLSearchParams({ redirectTo: request.url })
		throw redirect(`/login?${params}`)
	}

	return json({ user })
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const submission = await parseWithZod(formData, {
		schema: ChangeEmailSchema.superRefine(async (data, ctx) => {
			const existingUser = await prisma.user.findUnique({
				where: { email: data.email },
			})

			if (existingUser) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'This email is already in use.',
				})
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return json(submission.reply())
	}

	const { otp, redirectTo, verifyUrl } = await prepareVerification({
		period: 60 * 10,
		request,
		target: userId,
		type: 'change-email',
	})

	const response = await sendEmail({
		to: submission.value.email,
		subject: 'Email Change Verification',
		react: <EmailChangeEmail verifyUrl={verifyUrl.toString()} otp={otp} />,
	})

	if (response.status === 'success') {
		const cookie = request.headers.get('cookie')
		const verifySession = await verifySessionStorage.getSession(cookie)
		verifySession.set(newEmailAddressSessionKey, submission.value.email)

		return redirect(redirectTo, {
			headers: {
				'set-cookie': await verifySessionStorage.commitSession(verifySession),
			},
		})
	} else {
		return json(submission.reply({ formErrors: [response.error.message] }))
	}
}

function EmailChangeEmail({
	verifyUrl,
	otp,
}: {
	verifyUrl: string
	otp: string
}) {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>Email Change</E.Text>
				</h1>
				<p>
					<E.Text>
						Here is your verification code: <strong>{otp}</strong>
					</E.Text>
				</p>
				<E.Link href={verifyUrl}>{verifyUrl}</E.Link>
			</E.Container>
		</E.Html>
	)
}

function EmailChangeNoticeEmail({ userId }: { userId: string }) {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>Your Epic Notes email has been changed.</E.Text>
				</h1>
				<p>
					<E.Text>
						We are reaching out to let you know that your Epic Notes email has
						been changed.
					</E.Text>
				</p>
				<p>
					<E.Text>
						If you changed your email address, then you can safely ignore this.
						But if you did not change your email address, then please contact
						support immediately.
					</E.Text>
				</p>
				<p>
					<E.Text>Your Account ID: {userId}</E.Text>
				</p>
			</E.Container>
		</E.Html>
	)
}

export default function ChangeEmailIndex() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'change-email-form',
		lastResult: actionData,
		constraint: getZodConstraint(ChangeEmailSchema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ChangeEmailSchema })
		},
	})

	return (
		<div>
			<h1 className="text-h1">Change Email</h1>
			<p>You will receive an email at the new email address to confirm.</p>
			<p>
				An email notice will also be sent to your old address {data.user.email}.
			</p>
			<div className="mx-auto mt-5 max-w-sm">
				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<Field
						labelProps={{ children: 'New Email' }}
						inputProps={getInputProps(fields.email, { type: 'email' })}
						errors={fields.email.errors}
					/>
					<ErrorList id={form.errorId} errors={form.errors} />
					<div>
						<StatusButton
							status={isPending ? 'pending' : actionData?.status ?? 'idle'}
						>
							Send Confirmation
						</StatusButton>
					</div>
				</Form>
			</div>
		</div>
	)
}
