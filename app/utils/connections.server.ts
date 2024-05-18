import { createCookieSessionStorage } from '@remix-run/node'

export const connectionsSessionStorage = createCookieSessionStorage({
	cookie: {
		name: 'en_connection',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		maxAge: 60 * 10, // 10 mins
		secrets: process.env.SESSION_SECRET.split(''),
		secure: process.env.NODE_ENV === 'production',
	},
})
