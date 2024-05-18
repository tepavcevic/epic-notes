import { type LoaderFunctionArgs } from '@remix-run/node'
import { authenticator } from '#app/utils/auth.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	const data = await authenticator.authenticate('github', request, {
		throwOnError: true,
	})

	console.log(data)

	throw redirectWithToast('/login', {
		title: 'Auth success',
		description: 'success',
		type: 'success',
	})
}
