import { Linking } from 'react-native';
import { copyText } from './share';

/** Public safety/abuse report form (writes to the audited support queue and alerts the team). */
export const REPORT_URL = 'https://help.preppa.live/report-safety';

export interface ReportResult { opened: boolean; copied: boolean; reference: string }

/**
 * Report a piece of user content. Tries to copy a reference the reporter can paste into the
 * form's "Related ID" field, then opens the form. `copied` is false when the clipboard was
 * unavailable or denied, so the caller can show the reference instead of claiming it was copied.
 */
export async function reportContent(kind: 'post' | 'review', id: string, label: string): Promise<ReportResult> {
  const reference = `${kind} ${id} — ${label}`;
  const copied = await copyText(reference).catch(() => false);
  try {
    await Linking.openURL(REPORT_URL);
    return { opened: true, copied, reference };
  } catch {
    return { opened: false, copied, reference };
  }
}
