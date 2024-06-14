import { faker } from '@faker-js/faker'
import { test, expect, vi } from 'vitest'
import { getErrorMessage } from './misc.tsx'

test('Error object returns message.', () => {
	const message = faker.lorem.words(2)
	const error = new Error(message)
	expect(getErrorMessage(error)).toBe(message)
})

test('Error string returns message.', () => {
	const message = faker.lorem.words(2)
	expect(getErrorMessage(message)).toBe(message)
})

test('Random array returns Unknown Error.', () => {
	const error = ['Error']
	const consoleError = vi.spyOn(console, 'error')
	consoleError.mockImplementation(() => {})
	expect(getErrorMessage(error)).toBe('Unknown Error')
	expect(consoleError).toHaveBeenCalledTimes(1)
	expect(consoleError).toHaveBeenCalledWith(
		'Unable to get error message for error',
		error,
	)
	consoleError.mockRestore()
})
