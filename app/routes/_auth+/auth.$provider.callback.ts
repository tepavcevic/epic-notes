import { type LoaderFunctionArgs } from '@remix-run/node'
import { authenticator, getUserId } from '#app/utils/auth.server.ts'
import { ProviderNameSchema, providerLabels } from '#app/utils/connections.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'

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

	console.log(profile)

	const existingConnection = await prisma.connection.findUnique({
		select: { userId: true },
		where: {
			providerId_providerName: { providerId: profile.id, providerName },
		},
	})
	const userId = await getUserId(request)

	console.log({ existingConnection, userId, providerName })

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

	throw await redirectWithToast('/login', {
		title: 'Auth success',
		description: 'success',
		type: 'success',
	})
}
