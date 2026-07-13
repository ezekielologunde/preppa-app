import { Redirect } from 'expo-router';

// Meal-plan browsing + subscription management now live in the Experiences hub
// (Meal Plans / Experiences / My Plans tabs). This route is kept as a redirect so
// existing deep links and the post-subscribe return still work.
export default function PlansRedirect() {
  return <Redirect href="/experiences?tab=mine" />;
}
