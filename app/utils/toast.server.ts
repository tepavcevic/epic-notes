import { createId } from '@paralleldrive/cuid2'
import { createCookieSessionStorage, redirect } from '@remix-run/node'
import { z } from 'zod'
import { combineHeaders } from './misc.tsx'

export const toastKey = 'toast'

const ToastSchema = z.object({
	description: z.string(),
	id: z
		.string()
		.default(() => createId())
		.optional(),
	title: z.string().optional(),
	type: z.enum(['message', 'success', 'error']).default('message'),
})

export type Toast = z.infer<typeof ToastSchema>
export type ToastInput = z.infer<typeof ToastSchema>

export const toastSessionStorage = createCookieSessionStorage({
	cookie: {
		name: 'en_toast',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		secrets: process.env.SESSION_SECRET.split(','),
	},
})

export async function redirectWithToast(
	url: string,
	toast: ToastInput,
	init?: ResponseInit,
) {
	return redirect(url, {
		...init,
		headers: combineHeaders(init?.headers, await createToastHeaders(toast)),
	})
}

export async function createToastHeaders(toastInput: ToastInput) {
	const session = await toastSessionStorage.getSession()
	const toast = ToastSchema.parse(toastInput)
	session.flash(toastKey, toast)
	const cookie = await toastSessionStorage.commitSession(session)
	return new Headers({ 'set-cookie': cookie })
}

export async function getToast(request: Request) {
	const cookie = request.headers.get('cookie')

	const cookieSession = await toastSessionStorage.getSession(cookie)

	const toast = cookieSession.get('toast') ?? null
	const toastHeaders = new Headers()
	toastHeaders.append(
		'set-cookie',
		await toastSessionStorage.commitSession(cookieSession),
	)
	const headers = {
		'set-cookie': await toastSessionStorage.commitSession(cookieSession),
	}

	return { toast, headers }
}
