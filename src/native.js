// APEX · running inside the iPhone app (the Capacitor shell adds "ApexiOS" to the user agent).
// App Store rules: no Stripe purchase buttons in the app, and Google blocks its sign-in inside apps.
export const IN_APP = typeof navigator !== 'undefined' && /ApexiOS/.test(navigator.userAgent || '');
