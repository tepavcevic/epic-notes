import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import * as E from '@react-email/components'
import {
	type ActionFunctionArgs,
	redirect,
	type MetaFunction,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, useActionData, useSearchParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireAnonymous } from '#app/utils/auth.server.ts'
import { ProviderConnectionForm } from '#app/utils/connections.tsx'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { EmailSchema } from '#app/utils/user-validation.ts'
import { prepareVerification } from './verify.tsx'

const SignupSchema = z.object({
	email: EmailSchema,
	redirectTo: z.string().optional(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAnonymous(request)

	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)

	const submission = await parseWithZod(formData, {
		schema: SignupSchema.superRefine(async (data, ctx) => {
			const existingUser = await prisma.user.findUnique({
				where: { email: data.email },
				select: { id: true },
			})
			if (existingUser) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'User already exists with this email',
				})
				return
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return json(submission.reply())
	}

	const { email, redirectTo: postVerificationRedirectTo } = submission.value

	const { otp, redirectTo, verifyUrl } = await prepareVerification({
		period: 10 * 60,
		request,
		redirectTo: postVerificationRedirectTo,
		target: email,
		type: 'onboarding',
	})

	const response = await sendEmail({
		to: email,
		subject: 'Welcome aboard',
		react: <SignupEmail onboardingUrl={verifyUrl.toString()} otp={otp} />,
	})

	if (response.status === 'success') {
		return redirect(redirectTo.toString())
	} else {
		return json(submission.reply({ formErrors: [response.error.message] }))
	}
}

export function SignupEmail({
	onboardingUrl,
	otp,
}: {
	onboardingUrl: string
	otp: string
}) {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>Welcome to our epic app</E.Text>E.Text
					<p>
						<E.Text>
							Here is your verification code: <strong>{otp}</strong>
						</E.Text>
					</p>
					<p>
						<E.Text>Or click the link to get started:</E.Text>
					</p>
					<E.Link href={onboardingUrl}>{onboardingUrl}</E.Link>
				</h1>
			</E.Container>
		</E.Html>
	)
}

export const meta: MetaFunction = () => {
	return [{ title: 'Sign Up | Epic Notes' }]
}

export default function SignupRoute() {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')

	const [form, fields] = useForm({
		id: 'signup-form',
		defaultValue: { redirectTo },
		constraint: getZodConstraint(SignupSchema),
		lastResult: actionData,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SignupSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="container flex flex-col justify-center pb-32 pt-20">
			<div className="text-center">
				<h1 className="text-h1">Let&apos;s start your journey!</h1>
				<p className="mt-3 text-body-md text-muted-foreground">
					Please enter your email.
				</p>
			</div>
			<div className="mx-auto mt-16 min-w-[368px] max-w-sm">
				<Form
					method="POST"
					{...getFormProps(form)}
					className="mx-auto min-w-[368px] max-w-sm"
				>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<Field
						labelProps={{ htmlFor: fields.email.id, children: 'Email' }}
						inputProps={{
							...getInputProps(fields.email, { type: 'email' }),
							autoComplete: 'email',
							autoFocus: true,
							className: 'lowercase',
						}}
						errors={fields.email.errors}
					/>

					<input {...getInputProps(fields.redirectTo, { type: 'hidden' })} />

					<ErrorList errors={form.errors} id={form.errorId} />

					<StatusButton
						className="w-full"
						status={isPending ? 'pending' : actionData?.status ?? 'idle'}
						type="submit"
						disabled={isPending}
					>
						Create an account
					</StatusButton>
				</Form>
				<div className="mt-5 flex flex-col gap-5 border-b-2 border-t-2 border-border py-3">
					<ProviderConnectionForm
						providerName="github"
						type="Signup"
						redirectTo={redirectTo}
					/>
				</div>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
