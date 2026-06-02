import { RestaurantOnboardingFlow } from "@/components/dashboard/restaurant-onboarding-flow";

const previewPlans = [
  {
    id: "preview-pro",
    code: "pro",
    name: "Pro",
    description: null,
    monthly_price: 99000,
    trial_days: 14,
    features: []
  },
  {
    id: "preview-premium",
    code: "premium",
    name: "Premium",
    description: null,
    monthly_price: 199000,
    trial_days: 14,
    features: []
  }
];

export default function OnboardingPreviewPage() {
  return <RestaurantOnboardingFlow email="preview@logivn.local" initialPlanCode="pro" plans={previewPlans} />;
}
