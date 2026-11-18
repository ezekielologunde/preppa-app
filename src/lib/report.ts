import { Linking } from 'react-native';
import { copyText } from './share';

/** Public safety/abuse report form (writes to the audited support queue and alerts the team). */
export const REPORT_URL = 'https://help.preppa.live/report-safety';

/**
 * Report a piece of user content. Copies a reference the reporter can paste into the form's
 * "Related ID" field, then opens the form. Returns false if the form could not be opened.
 */
export async function reportContent(kind: 'post' | 'review', id: string, label: string): Promise<boolean> {
  await copyText(`${kind} ${id} — ${label}`).catch(() => false);
  try {
    await Linking.openURL(REPORT_URL);
    return true;
  } catch {
    return false;
  }
}
