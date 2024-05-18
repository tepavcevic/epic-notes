import {
	type SubmissionResult,
	getFormProps,
	getInputProps,
	useForm,
	type Intent,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	json,
	redirect,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import {
	Form,
	useActionData,
	useLoaderData,
	useSearchParams,
	type Params,
} from '@remix-run/react'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { z } from 'zod'
import { CheckboxField, ErrorList, Field } from '#app/components/forms.tsx'
import { Spacer } from '#app/components/spacer.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	authenticator,
	requireAnonymous,
	sessionKey,
} from '#app/utils/auth.server.ts'
import { ProviderNameSchema } from '#app/utils/connections.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { invariant, useIsPending } from '#app/utils/misc.tsx'
import { sessionStorage } from '#app/utils/session.server.ts'
import { NameSchema, UsernameSchema } from '#app/utils/user-validation.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { type VerifyFunctionArgs } from './verify.tsx'

export const onboardingEmailSessionKey = 'onboardingEmail'
export const providerIdKey = 'providerId'

const SignupFormSchema = z.object({
	imageUrl: z.string().optional(),
	username: UsernameSchema,
	name: NameSchema,
	agreeToTermsOfServiceAndPrivacyPolicy: z.boolean({
		required_error: 'You must agree to the terms of service and privacy policy',
	}),
	remember: z.boolean().optional(),
	redirectTo: z.string().optional(),
})

async function requireData({
	request,
	params,
}: {
	request: Request
	params: Params
}) {
	await requireAnonymous(request)
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const email = verifySession.get(onboardingEmailSessionKey)
	const providerId = verifySession.get(providerIdKey)
	const result = z
		.object({
			email: z.string(),
			providerName: ProviderNameSchema,
			providerId: z.string(),
		})
		.safeParse({ email, providerName: params.provider, providerId })
	if (result.success) {
		return result.data
	} else {
		console.error(result.error)
		throw redirect('/signup')
	}
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { email } = await requireData({ request, params })
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)

	const formError = cookieSession.get(authenticator.sessionErrorKey)

	return json({
		email,
		status: 'idle',
		submission: {
			intent: '' as unknown as Intent,
			payload: {} as Record<string, unknown>,
			error: {
				'': typeof formError === 'string' ? [formError] : [],
			},
		} as SubmissionResult<string[]>,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const { email, providerId, providerName } = await requireData({
		request,
		params,
	})
	const formData = await request.formData()
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)

	const submission = await parseWithZod(formData, {
		schema: SignupFormSchema.superRefine(async (data, ctx) => {
			const existingUser = await prisma.user.findUnique({
				where: { username: data.username },
				select: { id: true },
			})
			if (existingUser) {
				ctx.addIssue({
					path: ['username'],
					code: z.ZodIssueCode.custom,
					message: 'A user already exists with this username',
				})
				return
			}
		}).transform(async data => {
			console.log('TODO: implement third party onboarding', {
				...data,
				email,
				providerId,
				providerName,
			})
			const session = { id: 'TODO', expirationDate: new Date() }
			return { ...data, session }
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return json(submission.reply(), { status: 400 })
	}

	const { session, remember, redirectTo } = submission.value

	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	cookieSession.set(sessionKey, session.id)
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
		'submission.value should be defined by now',
	)
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
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

export default function SignupRoute() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')

	const [form, fields] = useForm({
		id: 'signup-form',
		constraint: getZodConstraint(SignupFormSchema),
		lastResult: actionData ?? data.submission,
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
					className="mx-auto min-w-[368px] max-w-sm"
					{...getFormProps(form)}
				>
					{fields.imageUrl.initialValue ? (
						<div className="mb-4 flex flex-col items-center justify-center gap-4">
							<img
								src={fields.imageUrl.initialValue}
								alt="Profile"
								className="h-24 w-24 rounded-full"
							/>
							<p className="text-body-sm text-muted-foreground">
								You can change your photo later
							</p>
							<input {...getInputProps(fields.imageUrl, { type: 'hidden' })} />
						</div>
					) : null}
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

					<CheckboxField
						labelProps={{
							htmlFor: fields.agreeToTermsOfServiceAndPrivacyPolicy.id,
							children:
								'Do you agree to our Terms of Service and Privacy Policy?',
						}}
						buttonProps={getInputProps(
							fields.agreeToTermsOfServiceAndPrivacyPolicy,
							{ type: 'checkbox' },
						)}
						errors={fields.agreeToTermsOfServiceAndPrivacyPolicy.errors}
					/>
					<CheckboxField
						labelProps={{
							htmlFor: fields.remember.id,
							children: 'Remember me',
						}}
						buttonProps={getInputProps(fields.remember, { type: 'checkbox' })}
						errors={fields.remember.errors}
					/>

					{redirectTo ? (
						<input type="hidden" name="redirectTo" value={redirectTo} />
					) : null}

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
