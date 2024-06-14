import { faker } from '@faker-js/faker'
import { test, expect } from 'vitest'
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
	expect(getErrorMessage(['Error'])).toBe('Unknown Error')
})
