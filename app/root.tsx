import os from 'node:os'
import { parseWithZod } from '@conform-to/zod'
import {
	json,
	type LoaderFunctionArgs,
	type LinksFunction,
	type ActionFunctionArgs,
	redirect,
} from '@remix-run/node'
import {
	Link,
	Links,
	LiveReload,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
	useMatches,
	type MetaFunction,
} from '@remix-run/react'
import { AuthenticityTokenProvider } from 'remix-utils/csrf/react'
import { HoneypotProvider } from 'remix-utils/honeypot/react'
import { Toaster } from 'sonner'
import { z } from 'zod'
import faviconAssetUrl from './assets/favicon.svg'
import { GeneralErrorBoundary } from './components/error-boundary.tsx'
import LogoutTimer from './components/logout-timer.tsx'
import { SearchBar } from './components/search-bar.tsx'
import ShowToast from './components/show-toast.tsx'
import { Spacer } from './components/spacer.tsx'
import ThemeSwitch from './components/theme-switch.tsx'
import { Button } from './components/ui/button.tsx'
import useTheme from './hooks/useTheme.tsx'
import fontStylestylesheetUrl from './styles/font.css'
import tailwindStylesheetUrl from './styles/tailwind.css'
import { csrf } from './utils/csrf.server.ts'
import { prisma } from './utils/db.server.ts'
import { getEnv } from './utils/env.server.ts'
import { honeypot } from './utils/honeypot.server.ts'
import {
	combineHeaders,
	getUserImgSrc,
	invariantResponse,
} from './utils/misc.tsx'
import { getUserId, sessionStorage } from './utils/session.server.ts'
import { getTheme, setTheme, type Theme } from './utils/theme.server.ts'
import { getToast } from './utils/toast.server.ts'
import { useOptionalUser } from './utils/user.ts'

export const links: LinksFunction = () => {
	return [
		{ rel: 'icon', type: 'image/svg+xml', href: faviconAssetUrl },
		{ rel: 'stylesheet', href: fontStylestylesheetUrl },
		{ rel: 'stylesheet', href: tailwindStylesheetUrl },
	]
}

export const meta: MetaFunction = () => {
	return [
		{ title: 'Epic Notes' },
		{ name: 'description', content: `Your own captain's log` },
	]
}

export async function loader({ request }: LoaderFunctionArgs) {
	const [csrfToken, csrfCookieHeader] = await csrf.commitToken(request)
	const honeyProps = honeypot.getInputProps()
	const { toast, headers: toastHeaders } = await getToast(request)
	const { userId } = await getUserId(request)
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)

	const user = userId
		? await prisma.user.findUnique({
				select: {
					id: true,
					username: true,
					name: true,
					image: { select: { id: true } },
				},
				where: { id: userId },
			})
		: null

	if (userId && !user) {
		return redirect('/', {
			headers: {
				'set-cookie': await sessionStorage.destroySession(cookieSession),
			},
		})
	}

	return json(
		{
			username: os.userInfo().username,
			ENV: getEnv(),
			theme: getTheme(request),
			user,
			toast,
			csrfToken,
			honeyProps,
		},
		{
			headers: combineHeaders(
				csrfCookieHeader ? { 'set-cookie': csrfCookieHeader } : null,
				toastHeaders,
			),
		},
	)
}

export const ThemeFormSchema = z.object({ theme: z.enum(['light', 'dark']) })

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	invariantResponse(
		formData.get('intent') === 'update-theme',
		'Invalid intent',
		{ status: 400 },
	)

	const submission = parseWithZod(formData, { schema: ThemeFormSchema })

	if (submission.status !== 'success') {
		return json(submission.reply())
	}

	const responseInit = {
		headers: {
			'set-cookie': setTheme(submission.value.theme),
		},
	}

	return json({ success: true, submission }, responseInit)
}

function Document({
	children,
	isLoggedIn = false,
	theme,
	env,
}: {
	children: React.ReactNode
	isLoggedIn?: boolean
	theme?: Theme
	env?: Record<string, string>
}) {
	return (
		<html lang="en" className={`${theme} h-full overflow-x-hidden`}>
			<head>
				<Meta />
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<Links />
			</head>
			<body className="flex h-full flex-col justify-between bg-background text-foreground">
				{children}
				<script
					dangerouslySetInnerHTML={{
						__html: `window.ENV = ${JSON.stringify(env)}`,
					}}
				/>
				{isLoggedIn && <LogoutTimer />}
				<Toaster closeButton position="top-center" />
				<ScrollRestoration />
				<Scripts />
				<LiveReload />
			</body>
		</html>
	)
}

function App() {
	const data = useLoaderData<typeof loader>()
	const theme = useTheme()
	const matches = useMatches()
	const isOnSearchPage = matches.find(m => m.id === 'routes/users+/index')
	const user = useOptionalUser()

	return (
		<Document theme={theme} env={data.ENV} isLoggedIn={!!user?.id}>
			<header className="container px-6 py-4 sm:px-8 sm:py-6">
				<nav className="flex items-center justify-between gap-4 sm:gap-6">
					<Link to="/">
						<div className="font-light">epic</div>
						<div className="font-bold">notes</div>
					</Link>
					{isOnSearchPage ? null : (
						<div className="ml-auto max-w-sm flex-1">
							<SearchBar status="idle" />
						</div>
					)}
					<div className="flex items-center gap-10">
						{user ? (
							<div className="flex items-center gap-2">
								<Button asChild variant="secondary">
									<Link
										to={`users/${user.username}`}
										className="flex items-center gap-2"
									>
										<img
											className="h-8 w-8 rounded-full object-cover"
											src={getUserImgSrc(user.image?.id)}
											alt={`${user.name ?? user.username} avatar`}
										/>
										<span className="text-body-sm font-bold">
											{user.name ?? user.username}
										</span>
									</Link>
								</Button>
							</div>
						) : (
							<Button asChild variant="default" size="sm">
								<Link to="/login">Log In</Link>
							</Button>
						)}
					</div>
				</nav>
			</header>

			<div className="flex-1">
				<Outlet />
			</div>

			<div className="container flex justify-between">
				<Link to="/">
					<div className="font-light">epic</div>
					<div className="font-bold">notes</div>
				</Link>
				<div className="flex items-center gap-2">
					<p>Built with ♥️ by {data.username}</p>
					<ThemeSwitch userPreference={theme} />
				</div>
			</div>
			<Spacer size="3xs" />
			{data.toast ? <ShowToast toast={data.toast} /> : null}
		</Document>
	)
}

export default function AppWithProviders() {
	const data = useLoaderData<typeof loader>()
	return (
		<HoneypotProvider {...data.honeyProps}>
			<AuthenticityTokenProvider token={data.csrfToken}>
				<App />
			</AuthenticityTokenProvider>
		</HoneypotProvider>
	)
}

export function ErrorBoundary() {
	return (
		<Document>
			<div className="flex-1">
				<GeneralErrorBoundary />
			</div>
		</Document>
	)
}
