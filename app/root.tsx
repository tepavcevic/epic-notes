import os from 'node:os'
import type { LinksFunction } from '@remix-run/node'
import {
	Link,
	Links,
	LiveReload,
	Meta,
	MetaFunction,
	Outlet,
	Scripts,
	ScrollRestoration,
	json,
	useLoaderData,
} from '@remix-run/react'

import favicon from './assets/favicon.svg'
import font from './styles/font.css'
import styles from './styles/tailwind.css'
import { getEnv } from './utils/env.server.ts'
import { cssBundleHref } from '@remix-run/css-bundle'

export const links: LinksFunction = () => {
	return [
		{ rel: 'icon', type: 'image/svg+xml', href: favicon },
		{ rel: 'stylesheet', href: font },
		{ rel: 'stylesheet', href: styles },
	]
}

export async function loader() {
	return json({ username: os.userInfo().username, ENV: getEnv() })
}

export default function App() {
	const data = useLoaderData<typeof loader>()

	return (
		<html lang="en" className="h-full overflow-x-hidden">
			<head>
				<Meta />
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<Links />
			</head>
			<body className="flex h-full flex-col justify-between bg-background text-foreground">
				<header className="container mx-auto py-6">
					<nav className="flex justify-between">
						<Link to="/">
							<div className="font-light">epic</div>
							<div className="font-bold">notes</div>
						</Link>
						<Link to="/users/kody/notes">Kody&apos;s Notes</Link>
					</nav>
				</header>

				<div className="flex-1">
					<Outlet />
				</div>

				<div className="container mx-auto flex justify-between">
					<Link to="/">
						<div className="font-light">epic</div>
						<div className="font-bold">notes</div>
					</Link>
					<p>Built with ♥️ by {data.username}</p>
				</div>
				<div className="h-5" />
				<ScrollRestoration />
				<script
					dangerouslySetInnerHTML={{
						__html: `window.ENV = ${JSON.stringify(data.ENV)}`,
					}}
				/>
				<Scripts />
				<LiveReload />
			</body>
		</html>
	)
}

export const meta: MetaFunction = () => {
	return [
		{ title: 'Epic Notes' },
		{ name: 'description', content: 'A note taking app' },
		{ name: 'viewport', content: 'width=device-width,initial-scale=1' },
		{ name: 'charset', content: 'utf-8' },
	]
}
