import {
	Link,
	MetaFunction,
	isRouteErrorResponse,
	useLoaderData,
	useParams,
	useRouteError,
} from '@remix-run/react'
import { LoaderFunctionArgs, json } from '@remix-run/node'
import { invariantResponse } from '../../utils/misc.tsx'
import { db } from '#app/utils/db.server.ts'

export function loader({ params }: LoaderFunctionArgs) {
	const user = db.user.findFirst({
		where: {
			username: {
				equals: params.username,
			},
		},
	})

	invariantResponse(user, 'User not found', { status: 404 })

	return json({
		user,
	})
}

export default function UserProfileRoute() {
	const { user } = useLoaderData<typeof loader>()

	return (
		<div className="container mb-48 mt-36">
			<h1 className="text-h1">{user.name || user.username}</h1>
			<Link to="notes" className="underline" prefetch="intent">
				Notes
			</Link>
		</div>
	)
}

export const meta: MetaFunction<typeof loader> = ({ data, params }) => {
	const displayName = data?.user.name ?? params.username
	return [
		{ title: `${displayName ?? 'Profile'} | Epic Notes` },
		{ name: 'description', content: `A profile page for ${displayName}` },
	]
}

export function ErrorBoundary() {
	const error = useRouteError()
	const params = useParams()
	console.log(error)

	const showMessage = () => {
		if (isRouteErrorResponse(error) && error.status === 404) {
			return (
				<div className="text-lg mt-4">
					<h1>User {params.username} found</h1>
				</div>
			)
		}
		return (
			<div className="text-lg mt-4">
				<h1>Ooops, something went wrong</h1>
			</div>
		)
	}

	return (
		<div className="flex flex-col h-full w-full items-center justify-center">
			<h1 className="text-h1">Error</h1>
			{showMessage()}
		</div>
	)
}
