import { createCookieSessionStorage } from '@remix-run/node'

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
