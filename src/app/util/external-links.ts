/**
 * Opening things outside the app from an installed PWA.
 *
 * On a phone an https link opens an in-app browser sheet. When iOS or Android
 * then hands that link to a native app (Google Maps claims its own URLs), the
 * empty sheet is left behind, so coming back to the app shows a blank white
 * screen. Map destinations therefore go through the map apps' own URL
 * schemes, which open the app directly with nothing left behind, with the web
 * URL as a fallback when no app answers. Ordinary websites keep the https
 * link: the sheet shows the page, which is what the user wanted.
 */

/** How long to give a native app to take over before falling back. */
const APP_OPEN_GRACE_MS = 1200;

type Platform = 'ios'|'android'|'other';

const platform = (): Platform => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) ||
      (navigator.maxTouchPoints > 1 && /Mac/.test(ua))) {
    return 'ios';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  return 'other';
};

/**
 * Navigates to an app URL scheme; if the page is still visible after the
 * grace period (no app answered) runs the fallback. Navigating to a scheme no
 * app handles is a no-op in an installed web app, so the page itself is safe.
 */
const openApp = (appUrl: string, fallback: () => void): void => {
  const timer = setTimeout(() => {
    if (document.visibilityState === 'visible') {
      fallback();
    }
  }, APP_OPEN_GRACE_MS);
  const cancel = () => clearTimeout(timer);
  document.addEventListener('visibilitychange', cancel, {once: true});
  window.addEventListener('pagehide', cancel, {once: true});
  window.addEventListener('blur', cancel, {once: true});
  window.location.href = appUrl;
};

const openWeb = (url: string): void => {
  window.open(url, '_blank', 'noopener');
};

/** Google Maps on the web: directions to a point. */
export const directionsWebUrl = (lat: number, long: number): string =>
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${long}`;

/** Google Maps on the web: a point on the map. */
export const placeWebUrl = (lat: number, long: number): string =>
    `https://www.google.com/maps/search/?api=1&query=${lat},${long}`;

/**
 * Directions to a workout. iPhones try Google Maps and fall back to Apple
 * Maps (always present); Android asks Google Maps; desktop opens the web.
 */
export const openDirections = (lat: number, long: number): void => {
  const web = directionsWebUrl(lat, long);
  switch (platform()) {
    case 'ios':
      openApp(
          `comgooglemaps://?daddr=${lat},${long}`,
          () => openApp(`maps://?daddr=${lat},${long}`, () => openWeb(web)));
      break;
    case 'android':
      openApp(`google.navigation:q=${lat},${long}`, () => openWeb(web));
      break;
    default:
      openWeb(web);
  }
};

/** The workout's spot on a map, same app choice as {@link openDirections}. */
export const openPlace = (lat: number, long: number): void => {
  const web = placeWebUrl(lat, long);
  switch (platform()) {
    case 'ios':
      openApp(
          `comgooglemaps://?q=${lat},${long}`,
          () => openApp(`maps://?q=${lat},${long}`, () => openWeb(web)));
      break;
    case 'android':
      openApp(`geo:${lat},${long}?q=${lat},${long}`, () => openWeb(web));
      break;
    default:
      openWeb(web);
  }
};

/** A plain website: the in-app browser is the right place for it. */
export const openWebsite = (url: string): void => {
  openWeb(url);
};
