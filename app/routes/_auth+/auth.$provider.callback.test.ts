import { faker } from '@faker-js/faker'
import { http } from 'msw'
import * as setCookieParser from 'set-cookie-parser'
import { afterEach, expect, test } from 'vitest'
import { connectionsSessionStorage } from '#app/utils/connections.server.ts'
import { prisma } from '#app/utils/db.server.js'
import { invariant } from '#app/utils/misc.js'
import { insertNewUser, insertedUsers } from '#tests/db-utils.js'
import { deleteGitHubUsers, insertGitHubUser } from '#tests/mocks/github.js'
import { server } from '#tests/mocks/index.ts'
import { consoleError } from '#tests/setup/setup-test-env.js'
import { loader } from './auth.$provider.callback.ts'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.js'
import { sessionStorage } from '#app/utils/session.server.js'

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
	const newUser = await insertNewUser()
	const session = await prisma.session.create({
		select: { id: true },
		data: { userId: newUser.id, expirationDate: getSessionExpirationDate() },
	})

	const request = await setupRequest({
		sessionId: session.id,
		code: githubUser.code,
	})
	const response = await loader({ request, params: PARAMS, context: {} })
	assertRedirect(response, '/settings/profile/connections')
	assertToastSent(response)

	const connection = await prisma.connection.findFirst({
		where: { userId: newUser.id, providerId: githubUser.profile.id },
	})

	console.log(connection)
})

async function setupRequest({
	sessionId,
	code = faker.string.uuid(),
}: { sessionId?: string; code?: string } = {}) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const state = faker.string.uuid()
	url.searchParams.set('state', state)
	url.searchParams.set('code', code)

	const cookieSession = await sessionStorage.getSession()
	if (sessionId) cookieSession.set(sessionKey, sessionId)

	const connectionCookieSession = await connectionsSessionStorage.getSession()
	connectionCookieSession.set('oauth2:state', state)
	const connectionSetCookieHeader =
		await connectionsSessionStorage.commitSession(connectionCookieSession)
	const setCookieHeader = await sessionStorage.commitSession(cookieSession)

	const connectionCookieHeader = convertSetCookieToCookie(
		connectionSetCookieHeader,
	)
	const cookieHeader = convertSetCookieToCookie(setCookieHeader)

	const request = new Request(url.toString(), {
		method: 'GET',
		headers: {
			cookie: [connectionCookieHeader, cookieHeader].join(';'),
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

function assertRedirect(response: Response, redirectTo: string) {
	expect(response.headers.get('location')).toBe(redirectTo)
	expect(response.status).toBeGreaterThanOrEqual(300)
	expect(response.status).toBeLessThan(400)
}

function convertSetCookieToCookie(setCookie: string) {
	const parsedCookie = setCookieParser.parseString(setCookie)
	return new URLSearchParams({
		[parsedCookie.name]: parsedCookie.value,
	}).toString()
}
