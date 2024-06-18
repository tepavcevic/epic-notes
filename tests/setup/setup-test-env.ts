import 'dotenv/config'
import { installGlobals } from '@remix-run/node'
import { type MockInstance, beforeEach, vi } from 'vitest'
import '#app/utils/env.server.ts'
import '@testing-library/jest-dom/vitest'

installGlobals()

export let consoleError: MockInstance<Parameters<(typeof console)['error']>>

beforeEach(() => {
	const originalConsoleError = console.error
	consoleError = vi.spyOn(console, 'error')
	consoleError.mockImplementation(
		(...args: Parameters<typeof console.error>) => {
			originalConsoleError(...args)
			throw new Error(
				'Console error was called. Call consoleError.mockImplementation(() => {}) if this is expected.',
			)
		},
	)
})
