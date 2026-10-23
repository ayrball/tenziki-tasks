// Works out which browser and OS someone is on, and what "install this app" means there.
// Kept free of browser globals so it can be unit-tested in Node.

export function detectEnvironment({ userAgent = '', maxTouchPoints = 0 } = {}) {
  const ua = userAgent;

  let os = 'other';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) os = 'ios'; // iPadOS reports as a Mac
  else if (/Android/i.test(ua)) os = 'android';
  else if (/Windows/i.test(ua)) os = 'windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'mac';
  else if (/Linux|X11|CrOS/i.test(ua)) os = 'linux';

  let browser = 'other';
  if (/Firefox\/|FxiOS\//i.test(ua)) browser = 'firefox';
  else if (/Edg(e|A|iOS)?\//i.test(ua)) browser = 'edge';
  else if (/Chrome\/|CriOS\/|Chromium\//i.test(ua)) browser = 'chrome';
  else if (/Safari\//i.test(ua)) browser = 'safari';

  return { browser, os };
}

// Only Chrome-family browsers let a page start the install itself (the beforeinstallprompt event).
export const supportsOneClickInstall = (env) => env.browser === 'chrome' || env.browser === 'edge';

// Plain-language steps for browsers where the page can't do it for the user.
export function installGuide(env) {
  const { browser, os } = env;
  const pin = os === 'windows' ? ['Right-click the app’s icon in your taskbar and choose “Pin to taskbar”.'] : [];

  if (os === 'ios') {
    return {
      title: 'Add to your Home Screen',
      steps: ['Tap the Share button (the square with an arrow).', 'Choose “Add to Home Screen”.', 'Tap “Add”.'],
    };
  }

  if (browser === 'firefox') {
    if (os === 'windows') {
      return {
        title: 'Install in Firefox',
        steps: [
          'Click the “Add tab to taskbar” icon at the right end of the address bar.',
          'Choose “Pin” when Firefox asks.',
        ],
        note: 'Needs a recent Firefox for Windows (version 143 or later). Firefox doesn’t let a website start this itself, so it has to be done from the address bar.',
      };
    }
    if (os === 'android') {
      return { title: 'Install in Firefox', steps: ['Open the Firefox menu (⋮).', 'Choose “Install”, or “Add to Home screen”.'] };
    }
    if (os === 'linux') {
      return {
        title: 'Install in Firefox',
        steps: [
          'Type about:config in the address bar and set browser.taskbarTabs.enabled to true.',
          'Click the “Add tab to taskbar” icon at the right end of the address bar.',
        ],
        note: 'Firefox for Linux has this switched off by default.',
      };
    }
    return {
      title: 'Not available in Firefox on this system',
      steps: ['Firefox for Mac can’t install web apps yet. Open this page in Chrome, Edge or Safari to install it.'],
    };
  }

  if (browser === 'safari') {
    return { title: 'Add to your Dock', steps: ['In the menu bar choose File → Add to Dock.', 'Click “Add”.'] };
  }

  if (browser === 'edge') {
    return {
      title: 'Install in Edge',
      steps: ['Open the Edge menu (⋯).', 'Choose Apps → Install this site as an app.', ...(os === 'windows' ? ['Tick “Pin to taskbar” when asked.'] : [])],
    };
  }

  if (browser === 'chrome') {
    if (os === 'android') {
      return { title: 'Install in Chrome', steps: ['Open the Chrome menu (⋮).', 'Choose “Install app”, or “Add to Home screen”.'] };
    }
    return {
      title: 'Install in Chrome',
      steps: [
        'Click the install icon at the right end of the address bar, or open the menu (⋮) → Cast, save and share → Install Tenziki Tasks.',
        ...pin,
      ],
      note: 'If you don’t see the icon, the app may already be installed.',
    };
  }

  return {
    title: 'Install this app',
    steps: ['Look for an “Install” or “Add to Home screen” option in your browser’s menu.'],
    note: 'Chrome and Edge install it with one click; Firefox, Safari and others use their own menu.',
  };
}
