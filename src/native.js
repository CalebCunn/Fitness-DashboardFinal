// APEX · the iPhone app. The app's user agent looks like Safari (so Google sign-in works),
// so the app is spotted by the Capacitor bridge it injects into every page instead.
export const IN_APP = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
// A feature needs both the app and a build that includes its plugin (older TestFlight builds don't).
export const hasPlugin = name => IN_APP && !!window.Capacitor?.isPluginAvailable?.(name);
export const HAS_HEALTH = hasPlugin('Health'), HAS_REMINDERS = hasPlugin('LocalNotifications');
const IPHONE = typeof navigator !== 'undefined' && /iPhone/.test(navigator.userAgent || '');
// Public TestFlight link. Empty hides the button.
export const TESTFLIGHT = 'https://testflight.apple.com/join/gjrXwzhr';
// "Get the iPhone app" shows only on an iPhone browser, never inside the app itself.
export const SHOW_APP_LINK = !!TESTFLIGHT && IPHONE && !IN_APP;

// ── Haptics (iPhone app only) ── a light tap on the main controls, like a native app.
let haptics=null;
export function tap(style='LIGHT'){
 if(!hasPlugin('Haptics'))return;
 // The module, not the plugin, goes through the promise: a plugin object looks like a promise itself.
 (haptics||(haptics=import('@capacitor/haptics'))).then(m=>m.Haptics.impact({style})).catch(()=>{});
}
const TAPPABLE='.dock button,[role=switch],[role=tab],[aria-pressed],.primary-action,.welcome-cta,.runs-opt,.apex-segments button';
export function installHaptics(){
 if(!hasPlugin('Haptics'))return;
 document.addEventListener('click',e=>{const b=e.target.closest?.(TAPPABLE);if(b&&!b.disabled)tap();},true);
}
