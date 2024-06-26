import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	type ActionFunctionArgs,
	json,
	redirect,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useActionData, useSearchParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { z } from 'zod'
import { Field, ErrorList, CheckboxField } from '#app/components/forms.tsx'
import { Spacer } from '#app/components/spacer.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { login, requireAnonymous, sessionKey } from '#app/utils/auth.server.ts'
import { ProviderConnectionForm } from '#app/utils/connections.tsx'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import {
	combineResponseInits,
	invariant,
	useIsPending,
} from '#app/utils/misc.tsx'
import { sessionStorage } from '#app/utils/session.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { PasswordSchema, UsernameSchema } from '#app/utils/user-validation.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { twoFAVerificationType } from '../settings+/profile.two-factor.tsx'
import { type VerifyFunctionArgs, getRedirectToUrl } from './verify.tsx'

const verifiedTimeKey = 'verified-time'
const unverifiedSessionIdKey = 'unverified-session-id'
const rememberKey = 'remember-me'

export async function handleNewSession(
	{
		request,
		session,
		remember = false,
		redirectTo,
	}: {
		request: Request
		session: { id: string; expirationDate: Date; userId: string }
		remember?: boolean
		redirectTo?: string
	},
	responseInit?: ResponseInit,
) {
	if (await shouldRequestTwoFA({ request, userId: session.userId })) {
		// not passing any cookie to getSession so we can create a new verification flow
		const verifySession = await verifySessionStorage.getSession()
		verifySession.set(unverifiedSessionIdKey, session.id)
		verifySession.set(rememberKey, remember)
		const redirectUrl = getRedirectToUrl({
			request,
			type: twoFAVerificationType,
			target: session.userId,
			redirectTo,
		})
		return redirect(
			redirectUrl.toString(),
			combineResponseInits(
				{
					headers: {
						'set-cookie':
							await verifySessionStorage.commitSession(verifySession),
					},
				},
				responseInit,
			),
		)
	} else {
		const cookie = request.headers.get('cookie')
		const cookieSession = await sessionStorage.getSession(cookie)
		cookieSession.set(sessionKey, session.id)

		return redirect(
			safeRedirect(redirectTo),
			combineResponseInits(
				{
					headers: {
						'set-cookie': await sessionStorage.commitSession(cookieSession, {
							expires: remember ? session.expirationDate : undefined,
						}),
					},
				},
				responseInit,
			),
		)
	}
}

export async function handleVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	invariant(
		submission.status === 'success',
		'submission value should be present by now',
	)

	const cookie = request.headers.get('cookie')
	const verifySession = await verifySessionStorage.getSession(cookie)
	const cookieSession = await sessionStorage.getSession(cookie)

	const rememberMe = verifySession.get(rememberKey)
	const { redirectTo } = submission.value
	const headers = new Headers()

	cookieSession.set(verifiedTimeKey, Date.now())

	const unverifiedSessionId = verifySession.get(unverifiedSessionIdKey)
	if (unverifiedSessionId) {
		const session = await prisma.session.findUnique({
			where: { id: unverifiedSessionId },
			select: { expirationDate: true },
		})

		if (!session) {
			throw await redirectWithToast('/login', {
				type: 'error',
				title: 'Invalid session',
				description: 'Could not find session to verify. Please try again.',
			})
		}

		cookieSession.set(sessionKey, unverifiedSessionId)
		headers.append(
			'set-cookie',
			await sessionStorage.commitSession(cookieSession, {
				expires: rememberMe ? session.expirationDate : undefined,
			}),
		)
	} else {
		headers.append(
			'set-cookie',
			await sessionStorage.commitSession(cookieSession),
		)
	}

	headers.append(
		'set-cookie',
		await verifySessionStorage.destroySession(verifySession),
	)

	return redirect(safeRedirect(redirectTo), { headers })
}

const LoginFormSchema = z.object({
	username: UsernameSchema,
	password: PasswordSchema,
	redirectTo: z.string().optional(),
	remember: z.boolean().optional(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAnonymous(request)

	return json({})
}

export async function shouldRequestTwoFA({
	request,
	userId,
}: {
	request: Request
	userId: string
}) {
	const cookie = request.headers.get('cookie')
	const verifySession = await verifySessionStorage.getSession(cookie)
	const unverifiedSessionId = verifySession.get(unverifiedSessionIdKey)

	if (unverifiedSessionId) return true

	const verification = await prisma.verification.findUnique({
		select: { id: true },
		where: {
			target_type: {
				target: userId,
				type: twoFAVerificationType,
			},
		},
	})

	const userHasTwoFA = Boolean(verification)
	if (!userHasTwoFA) return false

	const cookieSession = await sessionStorage.getSession(cookie)
	const verifiedTime = new Date(cookieSession.get(verifiedTimeKey) ?? 0)
	const twoHours = 1000 * 60 * 60 * 2
	// const twoHours = 10 * 2

	return Date.now() - verifiedTime.getTime() > twoHours
}

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()

	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)
	const submission = await parseWithZod(formData, {
		schema: LoginFormSchema.transform(async (data, ctx) => {
			const session = await login(data)

			if (!session) {
				ctx.addIssue({
					code: 'custom',
					message: 'Invalid username or password',
				})
				return z.NEVER
			}

			return { ...data, session }
		}),
		async: true,
	})

	delete submission.payload.password

	if (submission.status !== 'success') {
		return json(submission.reply())
	}

	const { session, remember, redirectTo } = submission.value

	return handleNewSession({ request, session, remember, redirectTo })
}

export default function LoginPage() {
	const lastResult = useActionData<typeof action>()
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')

	const [form, fields] = useForm({
		id: 'login-form',
		constraint: getZodConstraint(LoginFormSchema),
		defaultValue: { redirectTo },
		lastResult,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: LoginFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="flex min-h-full flex-col justify-center pb-32 pt-20">
			<div className="mx-auto w-full max-w-md">
				<div className="flex flex-col gap-3 text-center">
					<h1 className="text-h1">Welcome back!</h1>
					<p className="text-body-md text-muted-foreground">
						Please enter your details.
					</p>
				</div>
				<Spacer size="xs" />

				<div>
					<div className="mx-auto w-full max-w-md px-8">
						<Form method="POST" {...getFormProps(form)}>
							<AuthenticityTokenInput />
							<HoneypotInputs />
							<Field
								labelProps={{ children: 'Username' }}
								inputProps={{
									...getInputProps(fields.username, { type: 'text' }),
									autoFocus: true,
									className: 'lowercase',
								}}
								errors={fields.username.errors}
							/>

							<Field
								labelProps={{ children: 'Password' }}
								inputProps={{
									...getInputProps(fields.password, { type: 'password' }),
								}}
								errors={fields.password.errors}
							/>

							<div className="flex justify-between">
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
								<div>
									<Link
										to="/forgot-password"
										className="text-body-xs font-semibold"
									>
										Forgot password?
									</Link>
								</div>
							</div>

							<input
								{...getInputProps(fields.redirectTo, { type: 'hidden' })}
							/>

							<ErrorList errors={form.errors} id={form.errorId} />

							<div className="flex items-center justify-between gap-6 pt-3">
								<StatusButton
									className="w-full"
									status={isPending ? 'pending' : lastResult?.status ?? 'idle'}
									type="submit"
									disabled={isPending}
								>
									Log in
								</StatusButton>
							</div>
						</Form>
						<div className="mt-5 flex flex-col gap-5 border-b-2 border-t-2 border-border py-3">
							<ProviderConnectionForm
								providerName="github"
								type="Login"
								redirectTo={redirectTo}
							/>
						</div>
						<div className="flex items-center justify-center gap-2 pt-6">
							<span className="text-muted-foreground">New here?</span>
							<Link to="/signup">Create an account</Link>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
