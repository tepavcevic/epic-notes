import { test as base } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'

const nonexistentUser = '__some_random_gibberish__'
const test = base.extend<{
	insertNewUser: () => Promise<{
		id: string
		name: string | null
		username: string
	}>
}>({
	insertNewUser: async ({}, use) => {
		let userId: string | undefined = undefined

		await use(async () => {
			const newUser = await prisma.user.create({
				select: { id: true, name: true, username: true },
				data: createUser(),
			})
			userId = newUser.id
			return newUser
		})

		if (userId) {
			await prisma.user.delete({
				where: { id: userId },
			})
		}
	},
})
const { expect } = test

test('Search from homepage', async ({ page, insertNewUser }) => {
	const newUser = await insertNewUser()

	await page.goto('/')
	await page.getByRole('searchbox', { name: /search/i }).fill(newUser.username)
	await page.getByRole('button', { name: /search/i }).click()

	await page.waitForURL(
		`/users?${new URLSearchParams({ search: newUser.username })}`,
	)
	await expect(
		page.getByRole('heading', { name: /epic notes users/i }),
	).toBeVisible()
	const usersList = page.getByRole('main').getByRole('list')
	expect(usersList.getByRole('listitem')).toHaveCount(1)
	await expect(
		usersList.getByAltText(newUser.name ?? newUser.username),
	).toBeVisible()

	await page.getByRole('searchbox', { name: /search/i }).fill(nonexistentUser)
	await page.getByRole('button', { name: /search/i }).click()

	await page.waitForURL(`/users?search=${nonexistentUser}`)
	await expect(
		page.getByRole('heading', { name: /epic notes users/i }),
	).toBeVisible()
	await expect(usersList.getByRole('listitem')).toHaveCount(0)
	await expect(page.getByText(/no users found/i)).toBeVisible()
})
