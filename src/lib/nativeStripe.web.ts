/** Web stub — src/lib/payments.ts only calls these on native (Platform.OS-gated), so these
 *  bodies never run; they exist purely so Metro has something to resolve on web instead of
 *  nativeStripe.ts's real native-module import. See nativeStripe.ts for the native version. */
const unavailable = async () => {
  throw new Error('native Stripe SDK is not available on web');
};

export const confirmPayment: typeof import('@stripe/stripe-react-native').confirmPayment = unavailable as any;
export const initPaymentSheet: typeof import('@stripe/stripe-react-native').initPaymentSheet = unavailable as any;
export const presentPaymentSheet: typeof import('@stripe/stripe-react-native').presentPaymentSheet = unavailable as any;
