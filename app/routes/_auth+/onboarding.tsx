import { useForm, getFormProps, getInputProps } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	json,
	redirect,
	type MetaFunction,
} from '@remix-run/node'
import {
	useActionData,
	useSearchParams,
	Form,
	useLoaderData,
} from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { z } from 'zod'
import { Field, CheckboxField, ErrorList } from '#app/components/forms.tsx'
import { Spacer } from '#app/components/spacer.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireAnonymous, sessionKey, signup } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { invariant, useIsPending } from '#app/utils/misc.tsx'
import {
	EmailSchema,
	NameSchema,
	PasswordSchema,
	UsernameSchema,
} from '#app/utils/user-validation.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { type VerifyFunctionArgs } from './verify.tsx'

export const onboardingEmailSessionKey = 'onboardingEmail'

const SignupFormSchema = z
	.object({
		username: UsernameSchema,
		name: NameSchema,
		email: EmailSchema,
		password: PasswordSchema,
		confirmPassword: PasswordSchema,
		agreeToTermsOfServiceAndPrivacyPolicy: z.boolean({
			required_error:
				'You must agree to the terms of service and privacy policy',
		}),
		remember: z.boolean().optional(),
		redirectTo: z.string().optional(),
	})
	.superRefine(({ confirmPassword, password }, ctx) => {
		if (confirmPassword !== password) {
			ctx.addIssue({
				path: ['confirmPassword'],
				code: 'custom',
				message: 'The passwords must match',
			})
		}
	})

async function requireOnboardingEmail(request: Request) {
	await requireAnonymous(request)
	const cookie = request.headers.get('cookie')
	const verifySession = await verifySessionStorage.getSession(cookie)
	const email = verifySession.get(onboardingEmailSessionKey)

	if (typeof email !== 'string' || !email) {
		throw redirect('/signup')
	}

	return email
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAnonymous(request)
	const email = await requireOnboardingEmail(request)

	return json({ email })
}

export async function action({ request }: ActionFunctionArgs) {
	const email = await requireOnboardingEmail(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)

	const submission = await parseWithZod(formData, {
		schema: SignupFormSchema.superRefine(async (data, ctx) => {
			const existingUser = await prisma.user.findFirst({
				select: { id: true },
				where: { username: data.username },
			})

			if (existingUser) {
				ctx.addIssue({
					path: ['username'],
					code: z.ZodIssueCode.custom,
					message: 'User already exists with this username',
				})
				return
			}
		}).transform(async data => {
			const session = await signup({ ...data, email })
			return { ...data, session }
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return json(submission.reply())
	}
	if (!submission.value?.session) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	const { session, remember, redirectTo } = submission.value
	const cookie = request.headers.get('cookie')
	const cookieSession = await sessionStorage.getSession(cookie)
	cookieSession.set(sessionKey, session.id)
	const verifySession = await verifySessionStorage.getSession(cookie)

	const headers = new Headers()
	headers.append(
		'set-cookie',
		await sessionStorage.commitSession(cookieSession, {
			expires: remember ? session.expirationDate : undefined,
		}),
	)
	headers.append(
		'set-cookie',
		await verifySessionStorage.destroySession(verifySession),
	)

	return redirect(safeRedirect(redirectTo), { headers })
}

export async function handleVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	invariant(
		submission.status === 'success',
		'submission.value should be here by now',
	)
	const cookie = request.headers.get('cookie')
	const verifySession = await verifySessionStorage.getSession(cookie)
	verifySession.set(onboardingEmailSessionKey, submission.value.target)

	return redirect('/onboarding', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}

export const meta: MetaFunction = () => {
	return [{ title: 'Setup Epic Notes Account' }]
}

export default function OnboardingRoute() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')

	const [form, fields] = useForm({
		id: 'onboarding-form',
		defaultValue: { redirectTo },
		constraint: getZodConstraint(SignupFormSchema),
		lastResult: actionData,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SignupFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="container flex min-h-full flex-col justify-center pb-32 pt-20">
			<div className="mx-auto w-full max-w-lg">
				<div className="flex flex-col gap-3 text-center">
					<h1 className="text-h1">Welcome aboard {data.email}!</h1>
					<p className="text-body-md text-muted-foreground">
						Please enter your details.
					</p>
				</div>
				<Spacer size="xs" />
				<Form
					method="POST"
					{...getFormProps(form)}
					className="mx-auto min-w-[368px] max-w-sm"
				>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<Field
						labelProps={{ htmlFor: fields.username.id, children: 'Username' }}
						inputProps={{
							...getInputProps(fields.username, { type: 'text' }),
							autoComplete: 'username',
							className: 'lowercase',
						}}
						errors={fields.username.errors}
					/>
					<Field
						labelProps={{ htmlFor: fields.name.id, children: 'Name' }}
						inputProps={{
							...getInputProps(fields.name, { type: 'text' }),
							autoComplete: 'name',
						}}
						errors={fields.name.errors}
					/>
					<Field
						labelProps={{ htmlFor: fields.password.id, children: 'Password' }}
						inputProps={{
							...getInputProps(fields.password, { type: 'password' }),
							autoComplete: 'new-password',
						}}
						errors={fields.password.errors}
					/>

					<Field
						labelProps={{
							htmlFor: fields.confirmPassword.id,
							children: 'Confirm Password',
						}}
						inputProps={{
							...getInputProps(fields.confirmPassword, { type: 'password' }),
							autoComplete: 'new-password',
						}}
						errors={fields.confirmPassword.errors}
					/>

					<CheckboxField
						labelProps={{
							htmlFor: fields.agreeToTermsOfServiceAndPrivacyPolicy.id,
							children:
								'Do you agree to our Terms of Service and Privacy Policy?',
						}}
						buttonProps={{
							...getInputProps(fields.agreeToTermsOfServiceAndPrivacyPolicy, {
								type: 'checkbox',
							}),
						}}
						errors={fields.agreeToTermsOfServiceAndPrivacyPolicy.errors}
					/>

					<CheckboxField
						labelProps={{
							htmlFor: fields.remember.id,
							children: 'Remember me',
						}}
						buttonProps={getInputProps(fields.remember, {
							type: 'checkbox',
						})}
						errors={fields.remember.errors}
					/>

					<input {...getInputProps(fields.redirectTo, { type: 'hidden' })} />

					<ErrorList errors={form.errors} id={form.errorId} />

					<div className="flex items-center justify-between gap-6">
						<StatusButton
							className="w-full"
							status={isPending ? 'pending' : actionData?.status ?? 'idle'}
							type="submit"
							disabled={isPending}
						>
							Create an account
						</StatusButton>
					</div>
				</Form>
			</div>
		</div>
	)
}
