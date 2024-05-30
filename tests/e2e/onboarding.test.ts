import { faker } from '@faker-js/faker'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { test as base, waitFor } from '#tests/playwright-utils.ts'

const URL_REGEX = /(?<url>https?:\/\/[^\s$.?#].[^\s]*)/
function extractUrl(text: string) {
	const match = text.match(URL_REGEX)
	return match?.groups?.url
}

const test = base.extend<{
	getOnboardingData(): {
		username: string
		name: string
		email: string
		password: string
	}
}>({
	getOnboardingData: async ({}, use) => {
		const userData = createUser()
		await use(() => {
			const onboardingData = {
				...userData,
				password: faker.internet.password(),
			}
			return onboardingData
		})
		await prisma.user.deleteMany({ where: { username: userData.username } })
	},
})

const { expect } = test

test('onboarding with link', async ({ page, getOnboardingData }) => {
	const onboardingData = getOnboardingData()

	await page.goto('/')

	await page.getByRole('link', { name: /log in/i }).click()
	await expect(page).toHaveURL('/login')

	const createAccountLink = page.getByRole('link', {
		name: /create an account/i,
	})
	await createAccountLink.click()

	await expect(page).toHaveURL('/signup')

	await page.getByRole('textbox', { name: /email/i }).fill(onboardingData.email)
	await page.getByRole('button', { name: /submit/i }).click()
	await expect(
		page.getByRole('button', { name: /submit/i, disabled: true }),
	).toBeVisible()
	await expect(page.getByText(/check your email/i)).toBeVisible()

	const email = (await waitFor(() => {
		throw new Error('not yet implemented')
	})) as any

	expect(email.to).toBe(onboardingData.email.toLowerCase())
})
