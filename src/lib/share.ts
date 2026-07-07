import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/** Canonical web origin — shared links open the live app. */
export const SITE = 'https://app.preppa.live';

export type ShareResult = 'shared' | 'copied' | 'dismissed';

/**
 * Share a link to a screen. Web-first: uses the native share sheet where the
 * browser/OS supports it (mostly mobile), otherwise copies the URL to the
 * clipboard so the caller can confirm with a "Link copied" toast. Native uses
 * the OS share sheet.
 */
export async function shareLink({ title, url }: { title: string; url: string }): Promise<ShareResult> {
  if (Platform.OS === 'web') {
    const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
    try {
      if (nav?.share) {
        await nav.share({ title, url });
        return 'shared';
      }
    } catch {
      // user cancelled the share sheet, or it failed — fall through to copy
      return 'dismissed';
    }
    try {
      await copyText(url);
      return 'copied';
    } catch {
      return 'dismissed';
    }
  }
  try {
    const res = await Share.share({ title, message: url, url });
    return res.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch {
    return 'dismissed';
  }
}

type ToastFn = (msg: string, icon?: string, success?: boolean) => void;

/** Share a link and, when it silently fell back to the clipboard, confirm with a toast. */
export async function shareAndNotify(toast: ToastFn, opts: { title: string; url: string }): Promise<void> {
  const r = await shareLink(opts);
  if (r === 'copied') toast('Link copied', 'check', true);
}

/** Copy plain text to the clipboard. Returns true on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(text);
        return true;
      }
      return false;
    }
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
