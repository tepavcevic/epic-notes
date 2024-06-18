/**
 * @vitest-environment jsdom
 */
import { faker } from '@faker-js/faker'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { ErrorList } from '#app/components/forms.tsx'

afterEach(() => cleanup())

test('shows an error list', () => {
	render(<ErrorList errors={['error']} />)
	expect(screen.queryAllByRole('listitem')).toHaveLength(1)
})

test('shows nothing when given an empty list', () => {
	render(<ErrorList />)
	expect(screen.queryAllByRole('listitem')).toHaveLength(0)
})

test('can handle falsy values', () => {
	const errors = [faker.lorem.words(2), '', undefined, faker.lorem.words(3)]
	render(<ErrorList errors={errors} />)
	const actualErrors = errors.filter(Boolean)
	const errorElems = screen.queryAllByRole('listitem')
	expect(errorElems).toHaveLength(actualErrors.length)
	expect(errorElems.map(err => err.textContent)).toEqual(actualErrors)
})

test('adds id to the list', () => {
	const id = faker.lorem.word()
	render(<ErrorList errors={[id]} id={id} />)
	const ul = screen.getByRole('list')
	expect(ul).toHaveAttribute('id', id)
})
