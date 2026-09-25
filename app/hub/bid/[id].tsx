import React from 'react';
import { Redirect } from 'expo-router';

/** Compatibility route for old quote links. Quotes now submit from the live request list. */
export default function LegacyBidRedirect() {
  return <Redirect href="/hub/requests" />;
}
