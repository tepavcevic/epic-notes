import { faker } from '@faker-js/faker'
import { http } from 'msw'
import * as setCookieParser from 'set-cookie-parser'
import { afterEach, expect, test } from 'vitest'
import { connectionsSessionStorage } from '#app/utils/connections.server.ts'
import { invariant } from '#app/utils/misc.js'
import { server } from '#tests/mocks/index.ts'
import { consoleError } from '#tests/setup/setup-test-env.js'
import { loader } from './auth.$provider.callback.ts'

const ROUTE_PATH = '/auth/github/callback'
const PARAMS = { provider: 'github' }
const BASE_URL = 'https://epicnotesdemo.com'

afterEach(() => server.resetHandlers())

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
	asseertToast(response)
	expect(consoleError).toHaveBeenCalledTimes(1)
})

async function setupRequest() {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const state = faker.string.uuid()
	const code = faker.string.uuid()
	url.searchParams.set('state', state)
	url.searchParams.set('code', code)

	const cookieSession = await connectionsSessionStorage.getSession()
	cookieSession.set('oauth2:state', state)
	const setCookieHeader =
		await connectionsSessionStorage.commitSession(cookieSession)
	const cookieHeader = convertSetCookieToCookie(setCookieHeader)

	const request = new Request(url.toString(), {
		method: 'GET',
		headers: { cookie: cookieHeader },
	})

	return request
}

function asseertToast(response: Response) {
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
