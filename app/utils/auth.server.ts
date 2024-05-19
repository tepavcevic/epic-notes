import { type Connection, type Password, type User } from '@prisma/client'
import { redirect } from '@remix-run/node'
import bcrypt from 'bcryptjs'
import { Authenticator } from 'remix-auth'
import { GitHubStrategy } from 'remix-auth-github'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { connectionsSessionStorage } from './connections.server.ts'
import { prisma } from './db.server.ts'
import { combineResponseInits, downloadFile } from './misc.tsx'
import { sessionStorage } from './session.server.ts'
import { redirectWithToast } from './toast.server.ts'

const SESSION_EXPIRATION_TIME = 100 * 60 * 60 * 24 * 30

export function getSessionExpirationDate() {
	return new Date(Date.now() + SESSION_EXPIRATION_TIME)
}

export const sessionKey = 'sessionId'

type ProviderUser = {
	id: string
	email: string
	username?: string
	name?: string
	imageUrl?: string
}

export const authenticator = new Authenticator<ProviderUser>(
	connectionsSessionStorage,
)
authenticator.use(
	new GitHubStrategy(
		{
			clientID: process.env.GITHUB_CLIENT_ID,
			clientSecret: process.env.GITHUB_CLIENT_SECRET,
			callbackURL: '/auth/github/callback',
		},
		async ({ profile }) => {
			const email = profile.emails[0].value.trim().toLowerCase()
			if (!email) {
				throw await redirectWithToast('/login', {
					type: 'error',
					title: 'No email found',
					description: 'Please add a verified email to your github account.',
				})
			}
			return {
				email,
				id: profile.id,
				username: profile.displayName,
				name: profile.name.givenName,
				imageUrl: profile.photos[0].value,
			}
		},
	),
	'github',
)

export async function getUserId(request: Request) {
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = cookieSession.get(sessionKey)

	if (!sessionId) {
		return undefined
	}

	const session = await prisma.session.findUnique({
		select: { userId: true },
		where: { id: sessionId },
	})

	if (!session) {
		throw await logout({ request })
	}

	return session.userId
}

export async function requireAnonymous(request: Request) {
	const userId = await getUserId(request)

	if (userId) {
		throw redirect('/')
	}
}

export async function requireUserId(
	request: Request,
	{ redirectTo }: { redirectTo?: string | null } = {},
) {
	const userId = await getUserId(request)

	if (!userId) {
		const requestUrl = new URL(request.url)
		redirectTo =
			redirectTo === null
				? null
				: redirectTo ?? `${requestUrl.pathname}${requestUrl.search}`

		const loginParams = redirectTo ? new URLSearchParams({ redirectTo }) : null
		const loginRedirect = ['/login', loginParams?.toString()]
			.filter(Boolean)
			.join('?')

		throw redirect(loginRedirect)
	}

	return userId
}

export async function requireUser(request: Request) {
	const userId = await getUserId(request)
	const user = await prisma.user.findUnique({
		select: { id: true, username: true },
		where: { id: userId },
	})

	if (!user) {
		throw await logout({ request })
	}

	return user
}

export async function login({
	username,
	password,
}: {
	username: User['username']
	password: string
}) {
	const user = await verifyUserPassword({ username }, password)

	if (!user) return null

	const session = await prisma.session.create({
		select: { id: true, expirationDate: true, userId: true },
		data: {
			expirationDate: getSessionExpirationDate(),
			userId: user.id,
		},
	})

	return session
}

export async function resetUserPassword({
	username,
	password,
}: {
	username: User['username']
	password: string
}) {
	const hashedPassword = await getPasswordHash(password)

	const user = await prisma.user.update({
		select: { id: true },
		where: { username },
		data: { password: { update: { hash: hashedPassword } } },
	})

	return user
}

export async function signup({
	email,
	username,
	password,
	name,
}: {
	email: User['email']
	username: User['username']
	name: User['name']
	password: string
}) {
	const hashedPassword = await getPasswordHash(password)

	const session = await prisma.session.create({
		select: { id: true, expirationDate: true },
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					email: email.toLowerCase(),
					username: username.toLowerCase(),
					name,
					password: {
						create: {
							hash: hashedPassword,
						},
					},
				},
			},
		},
	})

	return session
}

export async function signupWithConnection({
	email,
	username,
	name,
	providerId,
	providerName,
	imageUrl,
}: {
	email: User['email']
	username: User['username']
	name: User['name']
	providerId: Connection['providerId']
	providerName: Connection['providerName']
	imageUrl?: string
}) {
	const session = await prisma.session.create({
		select: { id: true, expirationDate: true },
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					email: email.toLowerCase(),
					username: username.toLowerCase(),
					name,
					roles: { connect: { name: 'user' } },
					connections: { create: { providerId, providerName } },
					image: imageUrl
						? { create: await downloadFile(imageUrl) }
						: undefined,
				},
			},
		},
	})

	return session
}

export async function logout(
	{
		request,
		redirectTo = '/',
	}: {
		request: Request
		redirectTo?: string
	},
	responseInit?: ResponseInit,
) {
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = cookieSession.get(sessionKey)

	void prisma.session.delete({ where: { id: sessionId } }).catch(() => {})

	throw redirect(
		safeRedirect(redirectTo),
		combineResponseInits(responseInit, {
			headers: {
				'set-cookie': await sessionStorage.destroySession(cookieSession),
			},
		}),
	)
}

export async function getPasswordHash(password: string) {
	const hash = await bcrypt.hash(password, 10)
	return hash
}

export async function verifyUserPassword(
	where: Pick<User, 'username'> | Pick<User, 'id'>,
	password: Password['hash'],
) {
	const userWithPassword = await prisma.user.findUnique({
		where,
		select: { id: true, password: { select: { hash: true } } },
	})

	if (!userWithPassword || !userWithPassword.password) {
		return null
	}

	const isValid = await bcrypt.compare(password, userWithPassword.password.hash)

	if (!isValid) {
		return null
	}

	return { id: userWithPassword.id }
}
