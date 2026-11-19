import { expect, type Locator, type Page } from '@playwright/test';

export class HomePage {
  readonly heading: Locator;
  readonly startCourseLink: Locator;
  readonly openSandboxLink: Locator;
  readonly progressText: Locator;
  readonly mainNav: Locator;
  readonly courseSection: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1, name: 'Playwright Practice Lab' });
    this.startCourseLink = page.getByRole('link', { name: /^Start the course/ });
    this.openSandboxLink = page.getByRole('link', { name: 'Open the sandbox' });
    this.progressText = page.getByText(/lessons completed$/);
    this.mainNav = page.getByRole('navigation', { name: 'Main' });
    this.courseSection = page.getByRole('region', { name: 'Course' });
  }

  async goto() {
    await this.page.goto('./#/');
    await expect(this.heading).toBeVisible();
  }

  navLink(name: 'Lessons' | 'Sandbox' | 'Reference'): Locator {
    return this.mainNav.getByRole('link', { name, exact: true });
  }

  lessonLink(title: string): Locator {
    return this.courseSection.getByRole('link').filter({ hasText: title });
  }
}
