import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectEnvironment, installGuide, supportsOneClickInstall } from '../../src/lib/install.js';

const UA = {
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  firefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  ipadAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};

describe('detectEnvironment', () => {
  const cases = [
    ['chromeWin', 'chrome', 'windows'],
    ['edgeWin', 'edge', 'windows'],
    ['firefoxWin', 'firefox', 'windows'],
    ['firefoxMac', 'firefox', 'mac'],
    ['firefoxLinux', 'firefox', 'linux'],
    ['firefoxAndroid', 'firefox', 'android'],
    ['safariMac', 'safari', 'mac'],
    ['safariIphone', 'safari', 'ios'],
    ['chromeIphone', 'chrome', 'ios'],
    ['firefoxIphone', 'firefox', 'ios'],
    ['chromeAndroid', 'chrome', 'android'],
  ];
  for (const [key, browser, os] of cases) {
    it(`${key} -> ${browser} on ${os}`, () => {
      assert.deepEqual(detectEnvironment({ userAgent: UA[key] }), { browser, os });
    });
  }

  it('treats an iPad that reports itself as a Mac as iOS', () => {
    assert.equal(detectEnvironment({ userAgent: UA.ipadAsMac, maxTouchPoints: 5 }).os, 'ios');
    assert.equal(detectEnvironment({ userAgent: UA.ipadAsMac, maxTouchPoints: 0 }).os, 'mac');
  });

  it('falls back safely for unknown input', () => {
    assert.deepEqual(detectEnvironment({}), { browser: 'other', os: 'other' });
  });
});

describe('supportsOneClickInstall', () => {
  it('is true only for Chrome and Edge', () => {
    assert.equal(supportsOneClickInstall({ browser: 'chrome', os: 'windows' }), true);
    assert.equal(supportsOneClickInstall({ browser: 'edge', os: 'windows' }), true);
    for (const browser of ['firefox', 'safari', 'other']) assert.equal(supportsOneClickInstall({ browser, os: 'windows' }), false);
  });
});

describe('installGuide', () => {
  it('Firefox on Windows points at the "Add tab to taskbar" address-bar icon', () => {
    const g = installGuide({ browser: 'firefox', os: 'windows' });
    assert.match(g.steps.join(' '), /Add tab to taskbar/);
    assert.match(g.note, /143/);
  });

  it('Firefox on Mac says it is not available instead of giving steps that do not work', () => {
    const g = installGuide({ browser: 'firefox', os: 'mac' });
    assert.match(g.title, /Not available/);
    assert.match(g.steps.join(' '), /Chrome, Edge or Safari/);
  });

  it('Firefox on Linux explains the setting that is off by default', () => {
    assert.match(installGuide({ browser: 'firefox', os: 'linux' }).steps.join(' '), /browser\.taskbarTabs\.enabled/);
  });

  it('every iPhone/iPad browser gets the Share -> Add to Home Screen steps', () => {
    for (const browser of ['safari', 'chrome', 'firefox']) {
      assert.match(installGuide({ browser, os: 'ios' }).steps.join(' '), /Add to Home Screen/, browser);
    }
  });

  it('Safari on Mac uses Add to Dock', () => {
    assert.match(installGuide({ browser: 'safari', os: 'mac' }).steps.join(' '), /Add to Dock/);
  });

  it('only Windows guides mention pinning to the taskbar', () => {
    assert.match(installGuide({ browser: 'edge', os: 'windows' }).steps.join(' '), /Pin to taskbar/);
    assert.match(installGuide({ browser: 'chrome', os: 'windows' }).steps.join(' '), /Pin to taskbar/);
    assert.doesNotMatch(installGuide({ browser: 'chrome', os: 'mac' }).steps.join(' '), /taskbar/);
  });

  it('always returns a title and at least one step', () => {
    for (const browser of ['chrome', 'edge', 'firefox', 'safari', 'other']) {
      for (const os of ['windows', 'mac', 'linux', 'android', 'ios', 'other']) {
        const g = installGuide({ browser, os });
        assert.ok(g.title && g.steps.length > 0, `${browser}/${os}`);
      }
    }
  });
});
