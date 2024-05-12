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

const originalCommitSession = sessionStorage.commitSession

// monkey patching commitSession method to retain expires attribute of session when disabling 2FA
Object.defineProperty(sessionStorage, 'commitSession', {
	value: async (...args: Parameters<typeof originalCommitSession>) => {
		const [session, options] = args
		if (options?.expires) {
			session.set('expires', options.expires)
		}
		if (options?.maxAge) {
			const expires = new Date(Date.now() + options.maxAge * 1000)
			session.set('expires', expires)
		}
		const expires = session.has('expires')
			? new Date(session.get('expires'))
			: undefined

		const setCookieHeader = await originalCommitSession(session, {
			...options,
			expires,
		})

		return setCookieHeader
	},
})
