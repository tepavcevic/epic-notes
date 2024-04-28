import { redirect } from '@remix-run/node'
import { sessionStorage } from '#app/utils/session.server.ts'

export async function loader() {
	return redirect('/')
}

export async function action() {
	const cookieSession = await sessionStorage.getSession()
	return redirect('/', {
		headers: {
			'set-cookie': await sessionStorage.destroySession(cookieSession),
		},
	})
}
