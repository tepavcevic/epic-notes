import { createId as cuid } from '@paralleldrive/cuid2'
import { redirect } from '@remix-run/node'
import { type Strategy } from 'remix-auth'
import { GitHubStrategy } from 'remix-auth-github'
import { z } from 'zod'
import { connectionsSessionStorage } from '../connections.server.ts'
import { redirectWithToast } from '../toast.server.ts'
import { type AuthProvider, type ProviderUser } from './provider.ts'

const GitHubSchema = z.object({ login: z.string() })

const shouldMock = process.env.GITHUB_CLIENT_ID.startsWith('MOCK_')

export class GitHubProvider implements AuthProvider {
	async handleMockAction(request: Request): Promise<void> {
		if (!shouldMock) return

		const connectionSession = await connectionsSessionStorage.getSession(
			request.headers.get('cookie'),
		)
		const state = cuid()
		connectionSession.set('oauth2:state', state)
		const code = 'MOCK_GITHUB_CODE_HANNAH'
		const searchParams = new URLSearchParams({ code, state })

		throw redirect(`/auth/github/callback?${searchParams}`, {
			headers: {
				'set-cookie':
					await connectionsSessionStorage.commitSession(connectionSession),
			},
		})
	}
	async resolveConnectionData(
		providerId: string,
	): Promise<{ displayName: string; link?: string | null | undefined }> {
		const response = await fetch(`https://api.github.com/user/${providerId}`)
		const rawJson = await response.json()
		const result = GitHubSchema.safeParse(rawJson)

		return {
			displayName: result.success ? result.data.login : 'Unknown',
			link: result.success ? `https://github.com/${result.data.login}` : null,
		} as const
	}
	getAuthStrategy(): Strategy<ProviderUser, any> {
		return new GitHubStrategy(
			{
				clientID: process.env.GITHUB_CLIENT_ID,
				clientSecret: process.env.GITHUB_CLIENT_SECRET,
				callbackURL: '/auth/github/callback',
			},
			async ({ profile }) => {
				const email = profile.emails[0].value
				if (!email) {
					throw await redirectWithToast('/login', {
						title: 'No email found',
						description: 'Please add a verified email to your GitHub account.',
						type: 'message',
					})
				}

				const username = profile.displayName
				const name = profile.name.givenName
				const imageUrl = profile.photos[0].value

				return {
					email,
					id: profile.id,
					username,
					name,
					imageUrl,
				}
			},
		)
	}
}
