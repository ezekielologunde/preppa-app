import { confirmPayment, initPaymentSheet, presentPaymentSheet } from '@stripe/stripe-react-native';

/** Native only — see nativeStripe.web.ts. Metro resolves by platform extension, so the web
 *  bundle never parses this file's native-module import (unlike a same-platform dynamic
 *  import, which `output: "single"` still eagerly bundles). */
export { confirmPayment, initPaymentSheet, presentPaymentSheet };
