import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import {
	authenticator,
	getSessionExpirationDate,
	getUserId,
} from '#app/utils/auth.server.ts'
import { ProviderNameSchema, providerLabels } from '#app/utils/connections.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { handleNewSession } from './login.tsx'
import {
	onboardingEmailSessionKey,
	prefilledProfileKey,
	providerIdKey,
} from './onboarding_.$provider.tsx'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const providerName = ProviderNameSchema.parse(params.provider)

	const label = providerLabels[providerName]

	const profile = await authenticator
		.authenticate(providerName, request, {
			throwOnError: true,
		})
		.catch(async error => {
			console.error(error)
			throw await redirectWithToast('/login', {
				title: 'Auth failed',
				description: `An error occured while authenticating with ${label}.`,
				type: 'error',
			})
		})

	const existingConnection = await prisma.connection.findUnique({
		select: { userId: true },
		where: {
			providerId_providerName: { providerId: profile.id, providerName },
		},
	})
	const userId = await getUserId(request)

	if (existingConnection && userId) {
		throw await redirectWithToast('/settings/profile/connections', {
			title: 'Already connected',
			description:
				existingConnection.userId === userId
					? `You have already connected to your ${label} account.`
					: `That&apos;s someone else&apos;s ${label} account`,
			type: 'error',
		})
	}

	if (existingConnection) {
		const session = await prisma.session.create({
			select: { id: true, userId: true, expirationDate: true },
			data: {
				userId: existingConnection.userId,
				expirationDate: getSessionExpirationDate(),
			},
		})

		return handleNewSession({ request, session, remember: true })
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

	return redirect(`/onboarding/${providerName}`, {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}
