import { createId as cuid } from '@paralleldrive/cuid2'
import { redirect, type ActionFunctionArgs } from '@remix-run/node'
import { authenticator } from '#app/utils/auth.server.ts'
import { connectionsSessionStorage } from '#app/utils/connections.server.ts'

export async function loader() {
	return redirect('/login')
}

export async function action({ request }: ActionFunctionArgs) {
	const providerName = 'github'

	if (process.env.GITHUB_CLIENT_ID.startsWith('MOCK_')) {
		const connectionSession = await connectionsSessionStorage.getSession(
			request.headers.get('cookie'),
		)
		const state = cuid()
		connectionSession.set('oauth2:state', state)
		const code = 'MOCK_CODE_GITHUB_KODY'
		const searchParams = new URLSearchParams({ code, state })
		throw redirect(`auth/github/callback/${searchParams}`, {
			headers: {
				'set-cookie':
					await connectionsSessionStorage.commitSession(connectionSession),
			},
		})
	}

	return await authenticator.authenticate(providerName, request)
}