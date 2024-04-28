import { useFetchers, useRouteLoaderData } from '@remix-run/react'
import { type loader as rootLoader } from '#app/root.tsx'

export default function useTheme() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	const fetchers = useFetchers()
	const fetcher = fetchers.find(
		f => f.formData?.get('intent') === 'update-theme',
	)
	const optimisticTheme = fetcher?.formData?.get('theme')

	if (optimisticTheme === 'light' || optimisticTheme === 'dark') {
		return optimisticTheme
	}

	return data?.theme
}
