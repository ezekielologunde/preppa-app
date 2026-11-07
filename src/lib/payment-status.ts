export class PaymentUnconfirmedError extends Error {
  constructor(reason: 'processing' | 'unconfirmed' | 'unavailable') {
    super(reason === 'processing' ? 'Payment is still processing. Check your order before trying again.'
      : reason === 'unavailable' ? 'Payment status could not be verified. Check your order before trying again.'
      : 'Payment has not been confirmed. Check your order before trying again.');
    this.name = 'PaymentUnconfirmedError';
  }
}

export function unsettledPaymentMessage(error: unknown): string | undefined {
  return error instanceof PaymentUnconfirmedError ? error.message : undefined;
}

/** Stripe.js and the native SDK use different casing for the same states. */
export function requireSucceededPayment(status: string | undefined): void {
  if (status === 'succeeded' || status === 'Succeeded') return;
  if (status === 'processing' || status === 'Processing') {
    throw new PaymentUnconfirmedError('processing');
  }
  throw new PaymentUnconfirmedError('unconfirmed');
}
