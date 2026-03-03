import { type Locator, type Page } from '@playwright/test';
import { SEL } from '../selectors/constants';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  readonly viewTestId = 'home-view';

  constructor(page: Page) {
    super(page);
  }

  get glassCard(): Locator {
    return this.page.locator(SEL.homeGlassCard);
  }

  get title(): Locator {
    return this.page.locator(SEL.homeTitle);
  }

  get subtitle(): Locator {
    return this.page.locator(SEL.homeSubtitle);
  }

  get versionBadge(): Locator {
    return this.page.locator(SEL.homeVersionBadge);
  }

  get featureBadges(): Locator {
    return this.page.locator(SEL.homeFeatureBadges);
  }

  get featureCards(): Locator {
    return this.page.locator(SEL.homeFeatureCards);
  }

  get ctaStartChat(): Locator {
    return this.page.locator('[data-testid="btn-new-chat"]');
  }

  async clickStartChat(): Promise<void> {
    await this.ctaStartChat.click();
  }

  async getFeatureBadgeTexts(): Promise<string[]> {
    const badges = this.featureBadges.locator('span');
    const count = await badges.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await badges.nth(i).textContent();
      if (text?.trim()) texts.push(text.trim());
    }
    return texts;
  }
}
