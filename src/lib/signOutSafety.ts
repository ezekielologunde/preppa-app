interface LocalAuth {
  signOut(options: { scope: 'local' }): Promise<{ error: unknown }>;
  getSession(): Promise<{ data: { session: unknown | null }; error: unknown }>;
}

/** Local sign-out must be confirmed before the UI reports success. The SDK clears
 * local credentials first; a remote revocation error alone does not undo that. */
export async function confirmLocalSignOut(auth: LocalAuth): Promise<void> {
  await auth.signOut({ scope: 'local' });
  const result = await auth.getSession();
  if (result.error || result.data.session !== null) throw new Error('Sign-out could not be confirmed. Please try again.');
}
