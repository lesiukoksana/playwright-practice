import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';

test.describe('Home page', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
  });

  test('shows the page title and main heading', async ({ page }) => {
    // Intentionally wrong to see a failing test in CI. Restore to 'Playwright Practice Lab'.
    await expect(page).toHaveTitle('Playwright Practice Lab (broken)');
    await expect(homePage.heading).toBeVisible();
  });

  test('marks Lessons as the current page in the navigation', async () => {
    await expect(homePage.navLink('Lessons')).toHaveAttribute('aria-current', 'page');
    await expect(homePage.navLink('Sandbox')).not.toHaveAttribute('aria-current');
  });

  test('shows zero progress for a new visitor', async () => {
    await expect(homePage.progressText).toHaveText(/^0 \/ \d+ lessons completed$/);
  });

  test('"Start the course" opens the first lesson', async ({ page }) => {
    await homePage.startCourseLink.click();

    await expect(page).toHaveURL(/#\/lesson\/first-test$/);
  });

  test('"Open the sandbox" opens the sandbox', async ({ page }) => {
    await homePage.openSandboxLink.click();

    await expect(page).toHaveURL(/#\/sandbox$/);
  });

  test('a lesson in the course list opens that lesson', async ({ page }) => {
    await homePage.lessonLink('Find elements by role').click();

    await expect(page).toHaveURL(/#\/lesson\/get-by-role$/);
  });
});
