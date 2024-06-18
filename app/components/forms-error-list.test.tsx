/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ErrorList } from '#app/components/forms.tsx'

test('shows an error list', () => {
	render(<ErrorList errors={['error']} />)
	expect(screen.queryAllByRole('listitem')).toHaveLength(1)
})

test('shows nothing when given an empty list', () => {
	render(<ErrorList />)
	expect(screen.queryAllByRole('listitem')).toHaveLength(0)
})
