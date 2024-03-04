import { Link, MetaFunction, useLoaderData } from '@remix-run/react'
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
