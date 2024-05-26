import { expect, test } from '@playwright/test'

const nonexistentUser = '__some_random_gibberish__'

test('Search from homepage', async ({ page }) => {
	await page.goto('/')
	await page.getByRole('searchbox', { name: /search/i }).fill('kody')
	await page.getByRole('button', { name: /search/i }).click()

	await page.waitForURL('/users?search=kody')
	await expect(
		page.getByRole('heading', { name: /epic notes users/i }),
	).toBeVisible()
	const usersList = page.getByRole('main').getByRole('list')
	expect(usersList.getByRole('listitem')).toHaveCount(1)
	await expect(usersList.getByAltText('kody')).toBeVisible()

	await page.getByRole('searchbox', { name: /search/i }).fill(nonexistentUser)
	await page.getByRole('button', { name: /search/i }).click()

	await page.waitForURL(`/users?search=${nonexistentUser}`)
	await expect(
		page.getByRole('heading', { name: /epic notes users/i }),
	).toBeVisible()
	await expect(usersList.getByRole('listitem')).toHaveCount(0)
	await expect(page.getByText(/no users found/i)).toBeVisible()
})
