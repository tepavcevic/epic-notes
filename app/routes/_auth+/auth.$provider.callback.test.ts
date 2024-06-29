import { faker } from '@faker-js/faker'
import { http } from 'msw'
import * as setCookieParser from 'set-cookie-parser'
import { afterEach, expect, test } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.js'
import { connectionsSessionStorage } from '#app/utils/connections.server.ts'
import { prisma } from '#app/utils/db.server.js'
import { invariant } from '#app/utils/misc.js'
import { sessionStorage } from '#app/utils/session.server.js'
import { createUser, insertNewUser, insertedUsers } from '#tests/db-utils.js'
import { deleteGitHubUsers, insertGitHubUser } from '#tests/mocks/github.js'
import { server } from '#tests/mocks/index.ts'
import { consoleError } from '#tests/setup/setup-test-env.js'
import { loader } from './auth.$provider.callback.ts'

const ROUTE_PATH = '/auth/github/callback'
const PARAMS = { provider: 'github' }
const BASE_URL = 'https://epicnotesdemo.com'

afterEach(() => server.resetHandlers())
afterEach(async () => {
	await deleteGitHubUsers()
})
afterEach(async () => {
	await prisma.user.deleteMany({
		where: { id: { in: [...insertedUsers] } },
	})
	insertedUsers.clear()
})

test('a new user goes to onboarding', async () => {
	const request = await setupRequest()
	const response = await loader({ request, params: PARAMS, context: {} })

	assertRedirect(response, '/onboarding/github')
})

test('when login fails, send user to login', async () => {
	consoleError.mockImplementation(() => {})

	server.use(
		http.post('https://github.com/login/oauth/access_token', () => {
			return new Response('error', { status: 400 })
		}),
	)

	const request = await setupRequest()

	const response = await loader({ request, params: PARAMS, context: {} }).catch(
		r => r,
	)

	assertRedirect(response, '/login')
	assertToastSent(response)
	expect(consoleError).toHaveBeenCalledTimes(1)
})

test('when a user is logged in, it creates a new connection', async () => {
	const githubUser = await insertGitHubUser()
	const session = await setupUser()
	const request = await setupRequest({
		sessionId: session.id,
		code: githubUser.code,
	})
	const response = await loader({ request, params: PARAMS, context: {} })
	assertSessionMade(response, session.userId)
	assertRedirect(response, '/settings/profile/connections')
	assertToastSent(response)

	const connection = await prisma.connection.findFirst({
		where: { userId: session.userId, providerId: githubUser.profile.id },
	})

	expect(connection, 'connection has been made in the database').toBeTruthy()
})

async function setupRequest({
	sessionId,
	code = faker.string.uuid(),
}: { sessionId?: string; code?: string } = {}) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const state = faker.string.uuid()
	url.searchParams.set('state', state)
	url.searchParams.set('code', code)

	const connectionSession = await connectionsSessionStorage.getSession()
	connectionSession.set('oauth2:state', state)

	const cookieSession = await sessionStorage.getSession()
	if (sessionId) cookieSession.set(sessionKey, sessionId)

	const sessionSetCookieHeader =
		await sessionStorage.commitSession(cookieSession)
	const connectionSetCookieHeader =
		await connectionsSessionStorage.commitSession(connectionSession)

	const request = new Request(url.toString(), {
		method: 'GET',
		headers: {
			cookie: [
				convertSetCookieToCookie(sessionSetCookieHeader),
				convertSetCookieToCookie(connectionSetCookieHeader),
			].join('; '),
		},
	})
	return request
}

function assertToastSent(response: Response) {
	const setCookie = response.headers.get('set-cookie')
	invariant(setCookie, 'set-cookie header must be present')
	const parsedCookie = setCookieParser.splitCookiesString(setCookie)
	expect(parsedCookie).toEqual(
		expect.arrayContaining([expect.stringContaining('en_toast')]),
	)
}

async function assertSessionMade(response: Response, userId: string) {
	const cookie = response.headers.get('set-cookie')
	invariant(cookie, 'cookie must be present')
	const setCookies = setCookieParser.splitCookiesString(cookie)
	expect(setCookies).toEqual(
		expect.arrayContaining([expect.stringContaining('en_session')]),
	)
	const sessionId = setCookies.find(cookie => cookie === 'en_session')
	const session = await prisma.session.findFirst({
		where: { userId, id: sessionId },
	})
	expect(session?.id).toBe(sessionId)
}

function assertRedirect(response: Response, redirectTo: string) {
	expect(response.headers.get('location')).toBe(redirectTo)
	expect(response.status).toBeGreaterThanOrEqual(300)
	expect(response.status).toBeLessThan(400)
}

async function setupUser(userData = createUser()) {
	const newUser = await insertNewUser(userData)
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: { connect: newUser },
		},
		select: { id: true, userId: true },
	})

	return session
}

function convertSetCookieToCookie(setCookie: string) {
	const parsedCookie = setCookieParser.parseString(setCookie)
	return new URLSearchParams({
		[parsedCookie.name]: parsedCookie.value,
	}).toString()
}
