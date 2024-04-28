import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type ActionFunctionArgs, json, redirect } from '@remix-run/node'
import { Form, Link, useActionData } from '@remix-run/react'
import bcrypt from 'bcryptjs'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { Field, ErrorList, CheckboxField } from '#app/components/forms.tsx'
import { Spacer } from '#app/components/spacer.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { sessionStorage } from '#app/utils/session.server.ts'
import { PasswordSchema, UsernameSchema } from '#app/utils/user-validation.ts'

const LoginFormSchema = z.object({
	username: UsernameSchema,
	password: PasswordSchema,
	remember: z.boolean().optional(),
})

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()

	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)
	const submission = await parseWithZod(formData, {
		schema: LoginFormSchema.transform(async (data, ctx) => {
			const userWithHash = await prisma.user.findUnique({
				select: { id: true, password: { select: { hash: true } } },
				where: {
					username: data.username,
				},
			})

			if (!userWithHash || !userWithHash.password?.hash) {
				ctx.addIssue({
					code: 'custom',
					message: 'Invalid username or password',
				})
				return z.NEVER
			}

			const match = await bcrypt.compare(
				data.password,
				userWithHash.password?.hash,
			)

			if (!match) {
				ctx.addIssue({
					code: 'custom',
					message: 'Invalid username or password',
				})
				return z.NEVER
			}

			return { ...data, user: { id: userWithHash.id } }
		}),
		async: true,
	})

	delete submission.payload.password

	if (submission.status !== 'success') {
		return json(submission.reply())
	}

	if (!submission.value?.user) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	const { user, remember } = submission.value

	const cookie = request.headers.get('cookie')
	const cookieSession = await sessionStorage.getSession(cookie)
	cookieSession.set('userId', user.id)

	return redirect('/', {
		headers: {
			'set-cookie': await sessionStorage.commitSession(cookieSession, {
				expires: remember ? getSessionExpirationDate() : undefined,
			}),
		},
	})
}

export default function LoginPage() {
	const lastResult = useActionData<typeof action>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'login-form',
		constraint: getZodConstraint(LoginFormSchema),
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
