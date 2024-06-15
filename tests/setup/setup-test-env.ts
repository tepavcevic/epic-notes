import 'dotenv/config'
import { installGlobals } from '@remix-run/node'
import { type MockInstance, beforeEach, vi } from 'vitest'

installGlobals()

export let consoleError: MockInstance<Parameters<(typeof console)['error']>>

beforeEach(() => {
	const originalConsoleError = console.error
	consoleError = vi.spyOn(console, 'error')
	consoleError.mockImplementation(
		(...args: Parameters<(typeof console)['error']>) => {
			originalConsoleError(...args)
			throw new Error(
				'console.error was called. If that is expected, call consoleError.mockImplementation(() => {})',
			)
		},
	)
})
