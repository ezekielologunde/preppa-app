import React from 'react';
import { Redirect } from 'expo-router';

/** Compatibility route for old request links. Booking changes now use the live request list. */
export default function LegacyRequestRedirect() {
  return <Redirect href="/hub/requests" />;
}
