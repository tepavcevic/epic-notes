/**
 * @vitest-environment jsdom
 */

import { faker } from '@faker-js/faker'
import { json } from '@remix-run/node'
import { createRemixStub } from '@remix-run/testing'
import { render, screen } from '@testing-library/react'
import { AuthenticityTokenProvider } from 'remix-utils/csrf/react'
import { test } from 'vitest'
import { default as UsernameRoute, type loader } from './$username.tsx'
import { type loader as rootLoader } from '#app/root.tsx'
import { getEnv } from '#app/utils/env.server.js'
import { honeypot } from '#app/utils/honeypot.server.js'

const csrfToken = 'test-csrf-token'

function createFakeUser() {
	const user = {
		id: faker.string.uuid(),
		name: faker.person.fullName(),
		username: faker.internet.userName(),
		createdAt: faker.date.past(),
		image: {
			id: faker.string.uuid(),
		},
	}
	return user
}

test('The user profile when not logged in as self', async () => {
	const user = createFakeUser()
	const App = createRemixStub([
		{
			path: '/users/:username',
			Component: UsernameRoute,
			loader(): Awaited<ReturnType<typeof loader>> {
				return json({
					user,
					userJoinedDisplay: user.createdAt.toLocaleDateString(),
				})
			},
		},
	])

	const routePath = `/users/${user.username}`
	await render(<App initialEntries={[routePath]} />, {
		wrapper: ({ children }) => (
			<AuthenticityTokenProvider token={csrfToken}>
				{children}
			</AuthenticityTokenProvider>
		),
	})

	await screen.findByRole('heading', { level: 1, name: user.name })
	await screen.findByRole('img', { name: user.name })
	await screen.findByRole('link', { name: `${user.name}'s notes` })
})

test('The user profile when logged in as self', async () => {
	const user = createFakeUser()
	const App = createRemixStub([
		{
			path: '/',
			id: 'root',
			loader(): Awaited<ReturnType<typeof rootLoader>> {
				const honeyProps = honeypot.getInputProps()
				return json({
					username: 'whatever-test',
					ENV: { MODE: 'test' },
					theme: 'light',
					user: {
						...user,
						roles: [],
					},
					toast: null,
					csrfToken: csrfToken,
					honeyProps,
				})
			},
			children: [
				{
					path: '/users/:username',
					Component: UsernameRoute,
					loader(): Awaited<ReturnType<typeof loader>> {
						return json({
							user,
							userJoinedDisplay: user.createdAt.toLocaleDateString(),
						})
					},
				},
			],
		},
	])

	const routePath = `/users/${user.username}`
	await render(<App initialEntries={[routePath]} />, {
		wrapper: ({ children }) => (
			<AuthenticityTokenProvider token={csrfToken}>
				{children}
			</AuthenticityTokenProvider>
		),
	})

	await screen.findByRole('heading', { level: 1, name: user.name })
	await screen.findByRole('img', { name: user.name })
	await screen.findByRole('button', { name: /logout/i })
	await screen.findByRole('link', { name: /my notes/i })
	await screen.findByRole('link', { name: /edit profile/i })
})
