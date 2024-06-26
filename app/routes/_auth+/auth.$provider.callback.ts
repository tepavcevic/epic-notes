import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import {
	authenticator,
	getSessionExpirationDate,
	getUserId,
} from '#app/utils/auth.server.ts'
import { ProviderNameSchema, providerLabels } from '#app/utils/connections.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { combineHeaders, combineResponseInits } from '#app/utils/misc.tsx'
import {
	destroyRedirectToHeader,
	getRedirectCookieValue,
} from '#app/utils/redirect-cookie.server.ts'
import {
	createToastHeaders,
	redirectWithToast,
} from '#app/utils/toast.server.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { handleNewSession } from './login.tsx'
import {
	onboardingEmailSessionKey,
	prefilledProfileKey,
	providerIdKey,
} from './onboarding_.$provider.tsx'

const destroyRedirectTo = { 'set-cookie': destroyRedirectToHeader }

export async function loader({ request, params }: LoaderFunctionArgs) {
	const providerName = ProviderNameSchema.parse(params.provider)

	const redirectTo = getRedirectCookieValue(request)
	const label = providerLabels[providerName]

	const profile = await authenticator
		.authenticate(providerName, request, {
			throwOnError: true,
		})
		.catch(async error => {
			console.error(error)
			throw await redirectWithToast(
				'/login',
				{
					title: 'Auth failed',
					description: `An error occured while authenticating with ${label}.`,
					type: 'error',
				},
				{
					headers: destroyRedirectTo,
				},
			)
		})

	const existingConnection = await prisma.connection.findUnique({
		select: { userId: true },
		where: {
			providerId_providerName: { providerId: profile.id, providerName },
		},
	})
	const userId = await getUserId(request)

	if (existingConnection && userId) {
		throw await redirectWithToast(
			'/settings/profile/connections',
			{
				title: 'Already connected',
				description:
					existingConnection.userId === userId
						? `You have already connected to your ${label} account.`
						: `That&apos;s someone else&apos;s ${label} account`,
				type: 'error',
			},
			{
				headers: destroyRedirectTo,
			},
		)
	}

	if (userId) {
		await prisma.connection.create({
			data: { providerName, userId, providerId: profile.id },
		})

		throw await redirectWithToast(
			'/settings/profile/connections',
			{
				type: 'success',
				title: 'Connected',
				description: `Your "${profile.username}" ${label} account is connected.`,
			},
			{
				headers: destroyRedirectTo,
			},
		)
	}

	if (existingConnection) {
		return makeSession({
			request,
			userId: existingConnection.userId,
			redirectTo,
		})
	}

	// if the email matches then connect their accounts
	const user = await prisma.user.findUnique({
		select: { id: true },
		where: { email: profile.email },
	})

	if (user) {
		await prisma.connection.create({
			data: {
				userId: user.id,
				providerName,
				providerId: profile.id,
			},
		})

		return makeSession(
			{
				request,
				userId: user.id,
				redirectTo: redirectTo ?? '/settings/profile/connections',
			},
			{
				headers: await createToastHeaders({
					type: 'success',
					title: 'Connected',
					description: `Your "${profile.username}" ${label} account has been connected.`,
				}),
			},
		)
	}

	const cookie = request.headers.get('cookie')
	const verifySession = await verifySessionStorage.getSession(cookie)
	verifySession.set(onboardingEmailSessionKey, profile.email)
	verifySession.set(prefilledProfileKey, {
		...profile,
		username: profile.username
			?.replaceAll(/[^a-zA-Z0-9]/gi, '_')
			.toLowerCase()
			.slice(0, 20)
			.padEnd(3, '_'),
	})
	verifySession.set(providerIdKey, profile.id)

	const onboardingRedirect = [
		`/onboarding/${providerName}`,
		redirectTo ? new URLSearchParams({ redirectTo }) : null,
	]
		.filter(Boolean)
		.join('?')
	return redirect(onboardingRedirect.toString(), {
		headers: combineHeaders(
			{
				'set-cookie': await verifySessionStorage.commitSession(verifySession),
			},
			destroyRedirectTo,
		),
	})
}

async function makeSession(
	{
		request,
		userId,
		redirectTo,
	}: {
		request: Request
		userId: string
		redirectTo?: string | null
	},
	responseInit?: ResponseInit,
) {
	redirectTo ??= '/'

	const session = await prisma.session.create({
		select: { id: true, userId: true, expirationDate: true },
		data: {
			userId: userId,
			expirationDate: getSessionExpirationDate(),
		},
	})

	return handleNewSession(
		{ request, session, redirectTo, remember: true },
		combineResponseInits(
			{
				headers: destroyRedirectTo,
			},
			responseInit,
		),
	)
}
