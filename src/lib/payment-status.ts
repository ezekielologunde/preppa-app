/** Stripe.js and the native SDK use different casing for the same states. */
export function requireSucceededPayment(status: string | undefined): void {
  if (status === 'succeeded' || status === 'Succeeded') return;
  if (status === 'processing' || status === 'Processing') {
    throw new Error('Payment is still processing. Check your order before trying again.');
  }
  throw new Error('Payment has not been confirmed. Check your order before trying again.');
}
