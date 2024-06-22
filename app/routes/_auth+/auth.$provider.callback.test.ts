import { faker } from '@faker-js/faker'
import * as setCookieParser from 'set-cookie-parser'
import '#tests/mocks/index.ts'
import { expect, test } from 'vitest'
import { connectionsSessionStorage } from '#app/utils/connections.server.ts'
import { loader } from './auth.$provider.callback.ts'

const ROUTE_PATH = '/auth/github/callback'
const PARAMS = { provider: 'github' }
const BASE_URL = 'https://epicnotesdemo.com'

test('a new user goes to onboarding', async () => {
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

	const response = await loader({ request, params: PARAMS, context: {} })

	assertRedirect(response, '/onboarding/github')
})

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
