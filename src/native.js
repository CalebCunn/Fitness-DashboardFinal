// APEX · the iPhone app. The app's user agent looks like Safari (so Google sign-in works),
// so the app is spotted by the Capacitor bridge it injects into every page instead.
export const IN_APP = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
const IPHONE = typeof navigator !== 'undefined' && /iPhone/.test(navigator.userAgent || '');
// Public TestFlight link. Empty hides the button.
export const TESTFLIGHT = '';
// "Get the iPhone app" shows only on an iPhone browser, never inside the app itself.
export const SHOW_APP_LINK = !!TESTFLIGHT && IPHONE && !IN_APP;
