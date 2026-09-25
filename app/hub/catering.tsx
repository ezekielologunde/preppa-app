import React from 'react';
import { Redirect } from 'expo-router';

/** Compatibility route for old links. Service requests now use the server-backed hub. */
export default function LegacyCateringRedirect() {
  return <Redirect href="/hub/requests" />;
}
