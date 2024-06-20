/**
 * @vitest-environment jsdom
 */
import { act, render, renderHook, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { useDoubleCheck } from './misc.tsx'

test('hook: prevents default on the first click, and does not on the second', async () => {
	const { result } = await renderHook(() => useDoubleCheck())

	expect(result.current.doubleCheck).toBe(false)

	const mockClick = vi.fn()

	const clickEvent1 = new MouseEvent('click', {
		bubbles: true,
		cancelable: true,
	}) as unknown as React.MouseEvent<HTMLButtonElement>

	await act(() =>
		result.current.getButtonProps({ onClick: mockClick }).onClick(clickEvent1),
	)

	expect(mockClick).toHaveBeenCalledTimes(1)
	expect(mockClick).toHaveBeenCalledWith(clickEvent1)
	expect(clickEvent1.defaultPrevented).toBe(true)
	expect(result.current.doubleCheck).toBe(true)
	mockClick.mockClear()

	const clickEvent2 = new MouseEvent('click', {
		bubbles: true,
		cancelable: true,
	}) as unknown as React.MouseEvent<HTMLButtonElement>

	await act(() => {
		result.current.getButtonProps({ onClick: mockClick }).onClick(clickEvent2)
	})

	expect(mockClick).toHaveBeenCalledTimes(1)
	expect(mockClick).toHaveBeenCalledWith(clickEvent2)
	expect(clickEvent2.defaultPrevented).toBe(false)
})

function TestComponent() {
	const [defaultPrevented, setDefaultPrevented] = useState<
		'idle' | 'no' | 'yes'
	>('idle')
	const dc = useDoubleCheck()

	return (
		<div>
			<output>Default prevented: {defaultPrevented}</output>
			<button
				{...dc.getButtonProps({
					onClick: event =>
						setDefaultPrevented(event.defaultPrevented ? 'yes' : 'no'),
				})}
			>
				{dc.doubleCheck ? 'Are you sure?' : 'Click me'}
			</button>
		</div>
	)
}

test('Test component: prevents default on first click and does not on the second', async () => {
	const user = userEvent.setup()
	await render(<TestComponent />)

	const status = screen.getByRole('status')
	const button = screen.getByRole('button')

	expect(status).toHaveTextContent('Default prevented: idle')
	expect(button).toHaveTextContent('Click me')

	await user.click(button)

	expect(status).toHaveTextContent('Default prevented: yes')
	expect(button).toHaveTextContent('Are you sure?')

	await user.click(button)

	expect(status).toHaveTextContent('Default prevented: no')
})
