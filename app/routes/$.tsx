import { Link, useLocation } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'

export async function loader() {
	throw new Response('Not found', { status: 404 })
}

export default function NotFound() {
	return <ErrorBoundary />
}

export function ErrorBoundary() {
	const location = useLocation()
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<div className="flex flex-col gap-6">
						<div className="flex flex-col gap-3">
							<h1>We can't find this page:</h1>
							<pre className="whitespace-pre-wrap break-all text-body-lg">
								{location.pathname}
							</pre>
						</div>
						<Link to="/" className="text-body-md underline">
							Back to home
						</Link>
					</div>
				),
			}}
		/>
	)
}
