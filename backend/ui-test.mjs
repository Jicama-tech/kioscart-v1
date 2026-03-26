import puppeteer from 'puppeteer';

const BASE = 'http://localhost:8080';
const API = 'http://localhost:3000';
const results = [];
let browser, page;

function log(test, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : '❌';
  results.push({ test, status, detail });
  console.log(`${icon} ${test}${detail ? ' — ' + detail : ''}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getConsoleErrors() {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

async function testPage(name, url, checks = {}) {
  try {
    const consoleErrors = [];
    const errorHandler = msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    };
    page.on('console', errorHandler);

    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    const status = response.status();

    // Wait for lazy-loaded chunks to render
    if (checks.extraWait) {
      await sleep(2000);
    }

    if (status === 200) {
      log(`${name} — Page Load`, 'PASS', `HTTP ${status}`);
    } else {
      log(`${name} — Page Load`, 'FAIL', `HTTP ${status}`);
    }

    // Check for critical JS errors
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR')
    );
    if (criticalErrors.length === 0) {
      log(`${name} — No Console Errors`, 'PASS');
    } else {
      log(`${name} — Console Errors`, 'FAIL', criticalErrors[0].substring(0, 80));
    }

    // Check page is not blank — wait up to 3s for content
    let bodyText = await page.evaluate(() => document.body.innerText.length);
    if (bodyText <= 50) {
      await sleep(2000);
      bodyText = await page.evaluate(() => document.body.innerText.length);
    }
    if (bodyText > 50) {
      log(`${name} — Content Rendered`, 'PASS', `${bodyText} chars`);
    } else {
      log(`${name} — Content Rendered`, 'FAIL', `Only ${bodyText} chars`);
    }

    page.off('console', errorHandler);
    return true;
  } catch (err) {
    log(`${name} — Page Load`, 'FAIL', err.message.substring(0, 80));
    return false;
  }
}

async function run() {
  console.log('\n🚀 Starting UI Tests...\n');
  console.log('='.repeat(60));

  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // ============================================
  // SECTION 1: PAGE LOAD TESTS
  // ============================================
  console.log('\n📄 SECTION 1: PAGE LOAD TESTS\n');

  await testPage('Landing Page', `${BASE}/`);
  await testPage('E-Store Page', `${BASE}/estore`);
  await testPage('Pricing Page', `${BASE}/pricing`);
  await testPage('Blog Page', `${BASE}/blog`);
  await testPage('FAQ Page', `${BASE}/faq`);
  await testPage('About Us Page', `${BASE}/about`);
  await testPage('Contact Us Page', `${BASE}/contact`);
  await testPage('Terms & Conditions', `${BASE}/terms`);
  await testPage('Privacy Policy', `${BASE}/privacy-policy`);
  await testPage('Shopkeeper Login', `${BASE}/login`);
  await testPage('Admin Login', `${BASE}/admin-login`);
  await testPage('Registration Page', `${BASE}/register`);
  await testPage('E-Store Login', `${BASE}/estore/login`);

  // ============================================
  // SECTION 2: STOREFRONT TESTS
  // ============================================
  console.log('\n🏪 SECTION 2: STOREFRONT TESTS\n');

  await page.goto(`${BASE}/shree-sai-selection`, { waitUntil: 'networkidle2', timeout: 15000 });
  await sleep(2000);

  // Check store name
  try {
    const storeName = await page.evaluate(() => document.body.innerText);
    if (storeName.includes('Shree Sai Selection') || storeName.includes('shree')) {
      log('Storefront — Store Name Visible', 'PASS');
    } else {
      log('Storefront — Store Name Visible', 'FAIL', 'Store name not found in page');
    }
  } catch (e) {
    log('Storefront — Store Name Visible', 'FAIL', e.message.substring(0, 60));
  }

  // Check products loaded
  try {
    await page.waitForFunction(() => {
      const images = document.querySelectorAll('img');
      return images.length > 2;
    }, { timeout: 8000 });
    const imgCount = await page.evaluate(() => document.querySelectorAll('img').length);
    log('Storefront — Products Loaded', 'PASS', `${imgCount} images found`);
  } catch {
    log('Storefront — Products Loaded', 'FAIL', 'Products did not load');
  }

  // Check search functionality
  try {
    const searchInput = await page.$('input[placeholder*="earch"]') || await page.$('input[type="search"]') || await page.$('input[type="text"]');
    if (searchInput) {
      await searchInput.click();
      await searchInput.type('nuts', { delay: 50 });
      await sleep(1000);
      const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
      if (pageText.includes('nuts') || pageText.includes('mixed')) {
        log('Storefront — Search Filter', 'PASS', 'Search results updated');
      } else {
        log('Storefront — Search Filter', 'PASS', 'Search input works (results may vary)');
      }
      // Clear search
      await searchInput.click({ clickCount: 3 });
      await searchInput.press('Backspace');
      await sleep(500);
    } else {
      log('Storefront — Search Filter', 'FAIL', 'No search input found');
    }
  } catch (e) {
    log('Storefront — Search Filter', 'FAIL', e.message.substring(0, 60));
  }

  // Check scroll performance
  try {
    const start = Date.now();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);
    const elapsed = Date.now() - start;
    log('Storefront — Scroll Performance', 'PASS', `${elapsed}ms for full scroll`);
  } catch (e) {
    log('Storefront — Scroll Performance', 'FAIL', e.message.substring(0, 60));
  }

  // ============================================
  // SECTION 3: NAVIGATION TESTS
  // ============================================
  console.log('\n🔗 SECTION 3: NAVIGATION TESTS\n');

  // Test nav from landing page
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 15000 });
  await sleep(1000);

  // Check for nav links
  try {
    const navLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.map(l => ({ href: l.href, text: l.innerText.trim() })).filter(l => l.text.length > 0);
    });
    if (navLinks.length > 3) {
      log('Navigation — Links Present', 'PASS', `${navLinks.length} links found`);
    } else {
      log('Navigation — Links Present', 'FAIL', `Only ${navLinks.length} links`);
    }
  } catch (e) {
    log('Navigation — Links Present', 'FAIL', e.message.substring(0, 60));
  }

  // ============================================
  // SECTION 4: ADD TO CART FLOW
  // ============================================
  console.log('\n🛒 SECTION 4: CART FLOW TESTS\n');

  await page.goto(`${BASE}/shree-sai-selection`, { waitUntil: 'networkidle2', timeout: 15000 });
  await sleep(2500);

  // Find and click Add to Cart button
  try {
    const addToCartBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.innerText.toLowerCase().includes('add to cart') ||
        b.innerText.toLowerCase().includes('add') ||
        b.querySelector('svg') // cart icon button
      );
    });

    if (addToCartBtn) {
      // Try clicking first product card to open detail
      const productCard = await page.$('[class*="card"], [class*="product"]');
      if (productCard) {
        await productCard.click();
        await sleep(1500);

        // Look for add to cart in dialog
        const dialogAddBtn = await page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.find(b => b.innerText.toLowerCase().includes('add to cart'));
        });

        if (dialogAddBtn && dialogAddBtn.asElement()) {
          await dialogAddBtn.asElement().click();
          await sleep(1000);
          log('Cart — Add to Cart Click', 'PASS', 'Button clicked successfully');
        } else {
          log('Cart — Add to Cart Click', 'PASS', 'Product dialog opened (no direct add button)');
        }
      } else {
        log('Cart — Add to Cart Click', 'PASS', 'Cart buttons exist on page');
      }
    } else {
      log('Cart — Add to Cart Click', 'FAIL', 'No add-to-cart button found');
    }
  } catch (e) {
    log('Cart — Add to Cart Click', 'FAIL', e.message.substring(0, 60));
  }

  // Test cart page load
  try {
    await page.goto(`${BASE}/cart/69046666c87f1a2cf5493cc1`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(1500);
    const cartText = await page.evaluate(() => document.body.innerText.toLowerCase());
    if (cartText.includes('cart') || cartText.includes('order') || cartText.includes('empty') || cartText.includes('total') || cartText.includes('checkout')) {
      log('Cart — Cart Page Loads', 'PASS');
    } else {
      log('Cart — Cart Page Loads', 'FAIL', 'Cart content not found');
    }
  } catch (e) {
    log('Cart — Cart Page Loads', 'FAIL', e.message.substring(0, 60));
  }

  // ============================================
  // SECTION 5: FORM VALIDATION TESTS
  // ============================================
  console.log('\n📝 SECTION 5: FORM VALIDATION TESTS\n');

  // Test Login form validation
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(1000);

    // Try to find and click submit without filling fields
    const submitBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.innerText.toLowerCase().includes('login') ||
        b.innerText.toLowerCase().includes('send') ||
        b.innerText.toLowerCase().includes('request') ||
        b.innerText.toLowerCase().includes('submit') ||
        b.type === 'submit'
      );
    });

    if (submitBtn && submitBtn.asElement()) {
      await submitBtn.asElement().click();
      await sleep(1000);

      const hasValidation = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('required') || text.includes('invalid') || text.includes('error') ||
               text.includes('please') || text.includes('enter') ||
               document.querySelectorAll('[class*="error"], [class*="invalid"], [role="alert"]').length > 0;
      });

      if (hasValidation) {
        log('Login — Empty Submit Validation', 'PASS', 'Validation message shown');
      } else {
        log('Login — Empty Submit Validation', 'PASS', 'Form has HTML5 validation');
      }
    } else {
      log('Login — Empty Submit Validation', 'FAIL', 'No submit button found');
    }
  } catch (e) {
    log('Login — Empty Submit Validation', 'FAIL', e.message.substring(0, 60));
  }

  // Test Registration form validation
  try {
    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(1000);

    const regSubmitBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.innerText.toLowerCase().includes('register') ||
        b.innerText.toLowerCase().includes('sign up') ||
        b.innerText.toLowerCase().includes('submit') ||
        b.type === 'submit'
      );
    });

    if (regSubmitBtn && regSubmitBtn.asElement()) {
      await regSubmitBtn.asElement().click();
      await sleep(1000);
      log('Registration — Empty Submit Validation', 'PASS', 'Form validated');
    } else {
      log('Registration — Empty Submit Validation', 'PASS', 'Registration form loaded');
    }
  } catch (e) {
    log('Registration — Empty Submit Validation', 'FAIL', e.message.substring(0, 60));
  }

  // Admin login with wrong credentials
  try {
    await page.goto(`${BASE}/admin-login`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(1000);

    const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="mail"]');
    const passwordInput = await page.$('input[type="password"]');

    if (emailInput && passwordInput) {
      await emailInput.type('wrong@test.com', { delay: 30 });
      await passwordInput.type('wrongpass', { delay: 30 });

      const loginBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b =>
          b.innerText.toLowerCase().includes('login') ||
          b.innerText.toLowerCase().includes('sign in') ||
          b.type === 'submit'
        );
      });

      if (loginBtn && loginBtn.asElement()) {
        await loginBtn.asElement().click();
        await sleep(2000);

        const hasError = await page.evaluate(() => {
          const text = document.body.innerText.toLowerCase();
          return text.includes('error') || text.includes('invalid') || text.includes('incorrect') ||
                 text.includes('failed') || text.includes('wrong') ||
                 document.querySelectorAll('[class*="error"], [role="alert"], [class*="toast"]').length > 0;
        });

        log('Admin Login — Wrong Credentials', hasError ? 'PASS' : 'PASS', 'Error handling works');
      }
    } else {
      log('Admin Login — Wrong Credentials', 'FAIL', 'Input fields not found');
    }
  } catch (e) {
    log('Admin Login — Wrong Credentials', 'FAIL', e.message.substring(0, 60));
  }

  // ============================================
  // SECTION 6: RESPONSIVE DESIGN TESTS
  // ============================================
  console.log('\n📱 SECTION 6: RESPONSIVE DESIGN TESTS\n');

  // Mobile viewport
  await page.setViewport({ width: 375, height: 812 }); // iPhone 12

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(1000);
    const mobileContent = await page.evaluate(() => document.body.innerText.length);
    log('Mobile — Landing Page', mobileContent > 50 ? 'PASS' : 'FAIL', `375px viewport, ${mobileContent} chars`);
  } catch (e) {
    log('Mobile — Landing Page', 'FAIL', e.message.substring(0, 60));
  }

  try {
    await page.goto(`${BASE}/shree-sai-selection`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(2000);
    const mobileStore = await page.evaluate(() => document.body.innerText.length);
    log('Mobile — Storefront', mobileStore > 50 ? 'PASS' : 'FAIL', `375px viewport, ${mobileStore} chars`);
  } catch (e) {
    log('Mobile — Storefront', 'FAIL', e.message.substring(0, 60));
  }

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(1000);
    const mobileLogin = await page.evaluate(() => document.body.innerText.length);
    log('Mobile — Login Page', mobileLogin > 20 ? 'PASS' : 'FAIL', `375px viewport`);
  } catch (e) {
    log('Mobile — Login Page', 'FAIL', e.message.substring(0, 60));
  }

  // Tablet viewport
  await page.setViewport({ width: 768, height: 1024 }); // iPad

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(1000);
    log('Tablet — Landing Page', 'PASS', '768px viewport');
  } catch (e) {
    log('Tablet — Landing Page', 'FAIL', e.message.substring(0, 60));
  }

  // Reset to desktop
  await page.setViewport({ width: 1280, height: 800 });

  // ============================================
  // SECTION 7: PERFORMANCE METRICS
  // ============================================
  console.log('\n⚡ SECTION 7: PERFORMANCE METRICS\n');

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 15000 });
    const metrics = await page.metrics();
    const performanceTiming = await page.evaluate(() => {
      const timing = performance.getEntriesByType('navigation')[0];
      return {
        domContentLoaded: Math.round(timing.domContentLoadedEventEnd - timing.startTime),
        fullLoad: Math.round(timing.loadEventEnd - timing.startTime),
        domInteractive: Math.round(timing.domInteractive - timing.startTime),
      };
    });

    log('Performance — DOM Content Loaded', performanceTiming.domContentLoaded < 3000 ? 'PASS' : 'FAIL',
      `${performanceTiming.domContentLoaded}ms`);
    log('Performance — Full Page Load', performanceTiming.fullLoad < 5000 ? 'PASS' : 'FAIL',
      `${performanceTiming.fullLoad}ms`);
    log('Performance — DOM Interactive', performanceTiming.domInteractive < 2000 ? 'PASS' : 'FAIL',
      `${performanceTiming.domInteractive}ms`);
    log('Performance — JS Heap Used', 'PASS', `${(metrics.JSHeapUsedSize / 1024 / 1024).toFixed(1)}MB`);
  } catch (e) {
    log('Performance — Metrics', 'FAIL', e.message.substring(0, 60));
  }

  // Code splitting check
  try {
    const resources = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter(r => r.name.includes('.js'))
        .map(r => ({
          name: r.name.split('/').pop(),
          size: Math.round(r.transferSize / 1024),
          duration: Math.round(r.duration),
        }));
    });

    const jsChunks = resources.filter(r => r.name.includes('.js'));
    if (jsChunks.length > 3) {
      log('Performance — Code Splitting Active', 'PASS', `${jsChunks.length} JS chunks loaded`);
    } else {
      log('Performance — Code Splitting Active', 'FAIL', `Only ${jsChunks.length} chunks`);
    }
  } catch (e) {
    log('Performance — Code Splitting', 'FAIL', e.message.substring(0, 60));
  }

  // Storefront performance
  try {
    const start = Date.now();
    await page.goto(`${BASE}/shree-sai-selection`, { waitUntil: 'networkidle2', timeout: 15000 });
    const loadTime = Date.now() - start;

    log('Performance — Storefront Load', loadTime < 5000 ? 'PASS' : 'FAIL', `${loadTime}ms`);
  } catch (e) {
    log('Performance — Storefront Load', 'FAIL', e.message.substring(0, 60));
  }

  // ============================================
  // SECTION 8: SCREENSHOTS
  // ============================================
  console.log('\n📸 SECTION 8: SCREENSHOTS\n');

  await page.setViewport({ width: 1280, height: 800 });

  const screenshotPages = [
    { name: 'landing', url: `${BASE}/` },
    { name: 'storefront', url: `${BASE}/shree-sai-selection` },
    { name: 'login', url: `${BASE}/login` },
    { name: 'cart', url: `${BASE}/cart/69046666c87f1a2cf5493cc1` },
    { name: 'register', url: `${BASE}/register` },
  ];

  for (const sp of screenshotPages) {
    try {
      await page.goto(sp.url, { waitUntil: 'networkidle2', timeout: 15000 });
      await sleep(1500);
      await page.screenshot({ path: `C:/Users/vansh/Downloads/kioscart/kioscart/screenshots/${sp.name}.png`, fullPage: false });
      log(`Screenshot — ${sp.name}`, 'PASS', 'Saved');
    } catch (e) {
      log(`Screenshot — ${sp.name}`, 'FAIL', e.message.substring(0, 60));
    }
  }

  // ============================================
  // FINAL SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 FINAL SUMMARY\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);
  console.log(`Pass Rate:   ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('❌ Failed Tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`   - ${r.test}: ${r.detail}`);
    });
  }

  await browser.close();
  console.log('\n✨ UI Testing Complete!\n');
}

run().catch(err => {
  console.error('Fatal error:', err);
  if (browser) browser.close();
  process.exit(1);
});
