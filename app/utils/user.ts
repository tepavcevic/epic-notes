import { useRouteLoaderData } from '@remix-run/react'
import { type loader as rootLoader } from '#app/root.tsx'

export function useOptionalUser() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.user ?? null
}

export function useUser() {
	const maybeUser = useOptionalUser()

	if (!maybeUser) {
		throw new Error(
			'User not found. If the user is optional, use useOptionalUser instead.',
		)
	}
	return maybeUser
}
