import { Browser, BrowserContext, chromium, Page } from 'playwright';
import * as path from 'path';

const isDocker = process.env.IS_DOCKER === 'true';
const args = isDocker
  ? [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--single-process',
      '--disable-gpu',
      '--no-zygote',
    ]
  : ['--no-sandbox', '--disable-setuid-sandbox'];

const headless = isDocker ? true : false;

export class ScrapeWright {
  private browser!: Browser;
  private context!: BrowserContext;
  private page!: Page;

  constructor() {}

  async init(recordVideo: boolean = false): Promise<void> {
    this.browser = await chromium.launch({
      headless: headless,
      devtools: false,
      args: args,
    });

    const contextOptions: any = {
      locale: 'ko-KR',
    };

    if (recordVideo) {
      const videoDir = isDocker
        ? '/tmp/videos'
        : path.join(process.cwd(), 'videos');
      contextOptions.recordVideo = {
        dir: videoDir,
        size: { width: 960, height: 540 },
      };
    }

    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(60_000);
  }

  async blockResourceTypes(blockedTypes: string[], allowedUrls: string[] = []) {
    await this.page.route('**/*', (route) => {
      const type = route.request().resourceType();
      const url = route.request().url();
      const isAllowed = allowedUrls.some((pattern) => url.includes(pattern));
      if (blockedTypes.includes(type) && !isAllowed) {
        //console.log(`Blocking resource: ${type} - ${url}`);
        route.abort();
      } else {
        route.continue();
      }
    });
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'networkidle' });
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }

  async waitForTimeout(timeout: number): Promise<void> {
    await this.page.waitForTimeout(timeout);
  }

  async waitForLoadState() {
    await this.page.waitForLoadState('load');
  }

  async waitForNavigation() {
    await this.page.waitForNavigation({ waitUntil: 'networkidle' });
  }

  async fill(selector: string, text: string): Promise<void> {
    if (!(await this.exists(selector))) {
      return;
    }
    await this.page.locator(selector).fill(text);
  }

  async isVisible(selector: string): Promise<boolean> {
    const element = this.page.locator(selector);
    const isVisible = await element.isVisible();
    return isVisible;
  }

  async click(selector: string): Promise<void> {
    if (!(await this.exists(selector))) {
      return;
    }
    const element = this.page.locator(selector);
    await element.click();
  }

  async clickFirst(selector: string): Promise<void> {
    if (!(await this.exists(selector))) {
      return;
    }
    const element = this.page.locator(selector).first();
    await element.click();
  }

  async clickLast(selector: string): Promise<void> {
    if (!(await this.exists(selector))) {
      return;
    }
    const element = this.page.locator(selector).last();
    await element.click();
  }

  async javascriptClick(selector: string): Promise<void> {
    if (!(await this.exists(selector))) {
      return;
    }
    await this.page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (element) {
        (element as HTMLElement).click();
      }
    }, selector);
  }

  async clickWithCoordinates(selector: string): Promise<void> {
    if (!(await this.exists(selector))) {
      return;
    }
    const element = this.page.locator(selector);
    const box = await element.boundingBox();
    if (box) {
      console.log(JSON.stringify(box));
      await this.page.mouse.click(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
    }
  }

  async focusAndEnter(selector: string): Promise<void> {
    if (!(await this.exists(selector))) {
      return;
    }
    const element = this.page.locator(selector);
    await element.focus();
    await this.page.keyboard.press('Enter');
  }

  async exists(selector: string): Promise<boolean> {
    const count = await this.page.locator(selector).count();
    return count > 0;
  }

  async get(url: string, headers: { [key: string]: string }): Promise<any> {
    const response = await this.page.context().request.get(url, { headers });
    const body = await response.json();
    return body;
  }

  async post(url: string, options?: any): Promise<any> {
    const response = await this.page.context().request.post(url, options);
    const body = await response.json();
    return body;
  }

  async postResponse(url: string, options?: any): Promise<any> {
    const response = await this.page.context().request.post(url, options);
    return response;
  }

  async postWithTextRes(url: string, options?: any): Promise<any> {
    const response = await this.page.context().request.post(url, options);
    return await response.text();
  }

  async inputValue(selector: string): Promise<string> {
    const value = await this.page.locator(selector).inputValue();
    return value;
  }

  async screenshot(selector: string, options?: any): Promise<Buffer> {
    const buffer = await this.page.locator(selector).screenshot(options);

    return buffer;
  }

  async screenshotFullPage(options?: any): Promise<Buffer> {
    const buffer = await this.page.screenshot({
      fullPage: true,
      ...options,
    });

    return buffer;
  }

  async screenshotViewport(options?: any): Promise<Buffer> {
    const buffer = await this.page.screenshot({
      fullPage: false,
      ...options,
    });

    return buffer;
  }

  async existAttribute(selector: string, name: string): Promise<boolean> {
    const element = this.page.locator(selector);
    if (!(await element.count())) {
      return false;
    }
    const attribute = await element.getAttribute(name);

    console.log(`Attribute ${name} of ${selector}: ${attribute}`);
    return attribute !== null;
  }

  async getAttribute(selector: string, name: string): Promise<string | null> {
    const element = this.page.locator(selector);
    if (!(await element.count())) {
      return null;
    }
    const attribute = await element.getAttribute(name);

    console.log(`Attribute ${name} of ${selector}: ${attribute}`);
    return attribute;
  }

  async innerText(selector: string): Promise<string> {
    const element = this.page.locator(selector);
    const text = await element.innerText();
    return text;
  }

  async waitForRequestBody(
    urlSubstring: string,
    timeout = 2000,
    exactMatch: boolean = false,
  ): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      const listener = (request: any) => {
        const requestUrl = request.url();
        let isMatch = false;

        if (exactMatch) {
          isMatch = requestUrl === urlSubstring;
        } else {
          isMatch = requestUrl.includes(urlSubstring);
        }

        if (isMatch) {
          this.page.off('request', listener);
          clearTimeout(timer);
          resolve(request.postData());
        }
      };
      this.page.on('request', listener);

      const timer = setTimeout(() => {
        this.page.off('request', listener);
        reject(new Error('Timeout waiting for request body'));
      }, timeout);
    });
  }

  async evaluate<R, Arg = unknown>(
    pageFunction: (arg: Arg) => R | Promise<R>,
    arg?: Arg,
  ): Promise<R> {
    return await this.page.evaluate(pageFunction as any, arg);
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  async getVideoPath(): Promise<string | undefined> {
    const video = this.page.video();
    if (video) {
      const path = video.path();
      if (path) {
        return path;
      }
    }
    return undefined;
  }

  url(): string {
    return this.page.url();
  }

  async openPopup(url: string): Promise<Page> {
    const popupPromise = this.context.waitForEvent('page');

    await this.page.evaluate((popupUrl) => {
      window.open(
        popupUrl,
        '_blank',
        'width=500,height=600,scrollbars=yes,resizable=yes',
      );
    }, url);

    const popupPage = await popupPromise;
    return popupPage;
  }
}
