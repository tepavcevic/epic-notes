import {
	type Submission,
	getFormProps,
	getInputProps,
	useForm,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { generateTOTP, verifyTOTP } from '@epic-web/totp'
import {
	type ActionFunctionArgs,
	type MetaFunction,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	useActionData,
	useLoaderData,
	useSearchParams,
} from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Spacer } from '#app/components/spacer.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { getDomainUrl, useIsPending } from '#app/utils/misc.tsx'
import { handleVerification as handleChangeEmailVerification } from '../settings+/profile.change-email.tsx'
import { type twoFAVerifyVerificationType } from '../settings+/profile.two-factor.verify.tsx'
import { handleVerification as handleOnboardingVerification } from './onboarding.tsx'
import { handleVerification as handleResetPasswordVerification } from './reset-password.tsx'

export const codeQueryParam = 'code'
export const targetQueryParam = 'target'
export const typeQueryParam = 'type'
export const redirectToQueryParam = 'redirectTo'

const types = ['onboarding', 'forgot-password', 'change-email', '2fa'] as const
const VerificationTypeSchema = z.enum(types)
export type VerificationTypes = z.infer<typeof VerificationTypeSchema>

const VerifySchema = z.object({
	[codeQueryParam]: z.string().min(6).max(6),
	[targetQueryParam]: z.string(),
	[typeQueryParam]: VerificationTypeSchema,
	[redirectToQueryParam]: z.string().optional(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	const params = new URL(request.url).searchParams

	if (!params.has(codeQueryParam)) {
		return json({
			status: undefined,
			submission: {
				intent: '',
				payload: Object.fromEntries(params) as Record<string, unknown>,
				error: {} as Record<string, Array<string>>,
			},
		} as const)
	}

	return validateRequest(request, params)
}

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)

	return validateRequest(request, formData)
}

export function getRedirectToUrl({
	request,
	type,
	target,
	redirectTo,
}: {
	request: Request
	type: VerificationTypes
	target: string
	redirectTo?: string
}) {
	const redirectToUrl = new URL(`${getDomainUrl(request)}/verify`)
	redirectToUrl.searchParams.set(typeQueryParam, type)
	redirectToUrl.searchParams.set(targetQueryParam, target)

	if (redirectTo) {
		redirectToUrl.searchParams.set(redirectToQueryParam, redirectTo)
	}

	return redirectToUrl
}

export async function prepareVerification({
	period,
	request,
	type,
	target,
	redirectTo: postVerificationRedirectTo,
}: {
	period: number
	request: Request
	type: VerificationTypes
	target: string
	redirectTo?: string
}) {
	const verifyUrl = getRedirectToUrl({
		request,
		target,
		type,
		redirectTo: postVerificationRedirectTo,
	})
	const redirectTo = new URL(verifyUrl).toString()

	const { otp, ...verificationConfig } = generateTOTP({
		algorithm: 'SHA256',
		period,
	})

	const verificationData = {
		type,
		target,
		...verificationConfig,
		expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
	}
	await prisma.verification.upsert({
		where: { target_type: { target, type } },
		create: verificationData,
		update: verificationData,
	})

	verifyUrl.searchParams.set(codeQueryParam, otp)

	return { otp, redirectTo, verifyUrl }
}

export type VerifyFunctionArgs = {
	request: Request
	submission: Submission<z.infer<typeof VerifySchema>>
	body: FormData | URLSearchParams
}

export async function isCodeValid({
	code,
	type,
	target,
}: {
	code: string
	type: VerificationTypes | typeof twoFAVerifyVerificationType
	target: string
}) {
	const verification = await prisma.verification.findUnique({
		where: {
			target_type: { target, type },
			OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }],
		},
		select: { algorithm: true, secret: true, period: true, charSet: true },
	})

	if (!verification) return false

	const result = verifyTOTP({
		otp: code,
		secret: verification.secret,
		algorithm: verification.algorithm,
		charSet: verification.charSet,
		period: verification.period,
	})

	if (!result) return false

	return true
}

async function validateRequest(
	request: Request,
	body: URLSearchParams | FormData,
) {
	const submission = await parseWithZod(body, {
		schema: VerifySchema.superRefine(async (data, ctx) => {
			const codeIsValid = isCodeValid({
				code: data[codeQueryParam],
				target: data[targetQueryParam],
				type: data[typeQueryParam],
			})
			if (!codeIsValid) {
				ctx.addIssue({
					path: [codeQueryParam],
					code: z.ZodIssueCode.custom,
					message: 'Invalid code',
				})
				return
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

	const { value: submissionValue } = submission
	await prisma.verification.delete({
		where: {
			target_type: {
				target: submissionValue[targetQueryParam],
				type: submissionValue[typeQueryParam],
			},
		},
	})

	switch (submissionValue[typeQueryParam]) {
		case 'onboarding':
			return handleOnboardingVerification({ request, submission, body })
		case 'forgot-password':
			return handleResetPasswordVerification({ body, request, submission })
		case 'change-email':
			return handleChangeEmailVerification({ request, submission, body })
		case '2fa':
			throw new Error('not yet implemented')
	}
}

export const meta: MetaFunction = () => {
	return [{ title: 'Sign Up | Epic Notes' }]
}

export default function VerifyRoute() {
	const data = useLoaderData<any>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()

	const [form, fields] = useForm({
		id: 'verify-form',
		constraint: getZodConstraint(VerifySchema),
		lastResult: actionData ?? data.submission,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: VerifySchema })
		},
		defaultValue: {
			code: searchParams.get(codeQueryParam) ?? '',
			type: searchParams.get(typeQueryParam) ?? '',
			target: searchParams.get(targetQueryParam) ?? '',
			redirectTo: searchParams.get(redirectToQueryParam) ?? '',
		},
	})

	return (
		<div className="container flex flex-col justify-center pb-32 pt-20">
			<div className="text-center">
				<h1 className="text-h1">Check your email</h1>
				<p className="mt-3 text-body-md text-muted-foreground">
					We&apos;ve sent you a code to verify your email address.
				</p>
			</div>

			<Spacer size="xs" />

			<div className="mx-auto flex w-72 max-w-full flex-col justify-center gap-1">
				<div>
					<ErrorList errors={form.errors} id={form.id} />
				</div>

				<div className="flex w-full gap-2">
					<Form method="POST" {...getFormProps(form)} className="flex-1">
						<AuthenticityTokenInput />
						<Field
							labelProps={{
								htmlFor: fields[codeQueryParam].id,
								children: 'Code',
							}}
							inputProps={{
								...getInputProps(fields[codeQueryParam], { type: 'text' }),
							}}
							errors={fields[codeQueryParam].errors}
						/>

						<input
							{...getInputProps(fields[typeQueryParam], { type: 'hidden' })}
						/>

						<input
							{...getInputProps(fields[targetQueryParam], { type: 'hidden' })}
						/>

						<input
							{...getInputProps(fields[redirectToQueryParam], {
								type: 'hidden',
							})}
						/>

						<StatusButton
							className="w-full"
							status={isPending ? 'pending' : actionData?.status ?? 'idle'}
							type="submit"
							disabled={isPending}
						>
							Submit
						</StatusButton>
					</Form>
				</div>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
