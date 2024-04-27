import { createCookieSessionStorage } from '@remix-run/node'

export const sessionStorage = createCookieSessionStorage({
	cookie: {
		name: 'en_session',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		secrets: process.env.SESSION_SECRET.split(','),
	},
})

export async function getUserId(request: Request) {
	const cookie = request.headers.get('cookie')

	const cookieSession = await sessionStorage.getSession(cookie)

	const userId = cookieSession.get('userId') ?? null

	return { userId }
}
