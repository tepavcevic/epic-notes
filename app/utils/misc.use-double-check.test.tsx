/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
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
