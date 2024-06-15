import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env.ts'
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
	consoleError.mockImplementation(() => {})
	const error = ['Error']
	expect(getErrorMessage(error)).toBe('Unknown Error')
	expect(consoleError).toHaveBeenCalledTimes(1)
	expect(consoleError).toHaveBeenCalledWith(
		'Unable to get error message for error',
		error,
	)
})
