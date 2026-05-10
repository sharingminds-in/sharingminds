"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanCard } from "@/components/shared/subscription/plan-card";
import { UsageMeter } from "@/components/shared/subscription/usage-meter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import {
  type PublicSubscriptionPlan,
  usePublicSubscriptionPlans,
  useSubscriptionDetails,
  useSubscriptionUsage,
  subscriptionKeys,
} from "@/hooks/queries/use-subscription-queries";
import { useTRPCClient } from "@/lib/trpc/react";
import { queryKeys } from "@/lib/react-query";
import { useRazorpayCheckout } from "@/hooks/use-razorpay-checkout";
import type { PaymentCheckoutPayload } from "@/lib/payments/types";

interface SubscriptionFeature {
  feature_key: string;
  feature_name: string;
  is_included: boolean;
  value_type: "boolean" | "count" | "minutes" | "text" | "amount" | "percent" | "json";
  limit_count: number | null;
  limit_minutes: number | null;
  limit_text: string | null;
  limit_amount: number | null;
  limit_percent: number | null;
  limit_json: Record<string, any> | null;
  limit_interval: "day" | "week" | "month" | "year" | null;
  limit_interval_count: number | null;
  is_metered: boolean;
  unit?: string | null;
}

function formatLimit(feature: SubscriptionFeature) {
  if (!feature.is_included) return "Not included";
  if (feature.value_type === "boolean") return "Included";
  if (feature.value_type === "text" && feature.limit_text) return feature.limit_text;

  const interval =
    feature.limit_interval && feature.limit_interval_count
      ? ` per ${feature.limit_interval_count} ${feature.limit_interval}`
      : feature.limit_interval
        ? ` per ${feature.limit_interval}`
        : "";

  if (feature.value_type === "count" && feature.limit_count !== null) {
    return `Up to ${feature.limit_count}${feature.unit ? ` ${feature.unit}` : ""}${interval}`;
  }
  if (feature.value_type === "minutes" && feature.limit_minutes !== null) {
    return `Up to ${feature.limit_minutes} minutes${interval}`;
  }
  if (feature.value_type === "amount" && feature.limit_amount !== null) {
    return `Up to ${feature.limit_amount}${interval}`;
  }
  if (feature.value_type === "percent" && feature.limit_percent !== null) {
    return `Up to ${feature.limit_percent}%${interval}`;
  }

  return "Included";
}

export function SubscriptionDisplay() {
  const { isMentor, isMentee, isLoading: authLoading } = useAuth();
  const preferredAudience = isMentor ? "mentor" : isMentee ? "mentee" : null;
  const [selectingPlanId, setSelectingPlanId] = useState<string | null>(null);
  const {
    data: subscriptionData,
    isLoading: subscriptionLoading,
    error: subscriptionError,
  } = useSubscriptionDetails(
    preferredAudience ?? "mentee",
    !authLoading && Boolean(preferredAudience)
  );
  const { data: usage = [] } = useSubscriptionUsage(
    preferredAudience ?? "mentee",
    !authLoading && Boolean(preferredAudience)
  );
  const audienceForPlans = subscriptionData?.subscription?.audience ?? preferredAudience;
  const {
    data: plans = [],
    isLoading: plansLoading,
    error: plansError,
  } = usePublicSubscriptionPlans(audienceForPlans, !authLoading && Boolean(audienceForPlans));
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const openPaymentCheckout = useRazorpayCheckout();

  const subscription = subscriptionData?.subscription ?? null;
  const features = subscriptionData?.features ?? [];

  const handleSelectPlan = async (plan: PublicSubscriptionPlan) => {
    if (selectingPlanId) return;
    const monthlyPrice = plan.subscription_plan_prices.find(
      (price) => price.billing_interval === "month" && price.is_active
    );

    setSelectingPlanId(plan.id);
    try {
      const payment = (await trpcClient.payments.startSubscription.mutate({
        planId: plan.id,
        priceId: monthlyPrice?.id,
      })) as PaymentCheckoutPayload;
      await openPaymentCheckout(payment);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: subscriptionKeys.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionWithRoles }),
      ]);
      toast.success("Plan selected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to select plan");
    } finally {
      setSelectingPlanId(null);
    }
  };

  const meteredUsage = useMemo(
    () => usage.filter((entry) => ["count", "minutes", "amount", "percent"].includes(entry.value_type)),
    [usage]
  );

  const loading = authLoading || subscriptionLoading || (Boolean(audienceForPlans) && plansLoading);
  const error =
    (subscriptionError instanceof Error ? subscriptionError.message : null) ||
    (plansError instanceof Error ? plansError.message : null);

  if (loading) {
    return <div>Loading subscription details...</div>;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error || "No subscription found."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {subscription ? (
        <PlanCard
          planName={subscription.plan_name}
          status={subscription.status}
          periodEnd={subscription.current_period_end}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You do not have an active subscription yet. Choose a plan to get started.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-none bg-transparent shadow-none">
        <CardHeader className="px-0">
          <CardTitle className="text-2xl">Choose a plan</CardTitle>
          <p className="text-sm text-muted-foreground">
            Compare plans and pick the one that matches your goals.
          </p>
        </CardHeader>
        <CardContent className="grid gap-6 px-0 md:grid-cols-2">
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active plans available.</p>
          ) : (
            plans.map((plan) => {
              const monthlyPrice = plan.subscription_plan_prices.find(
                (price) => price.billing_interval === "month" && price.is_active
              );
              const isCurrent = subscription ? plan.id === subscription.plan_id : false;
              const priceLabel = monthlyPrice
                ? new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: monthlyPrice.currency || "USD",
                }).format(monthlyPrice.amount)
                : "Custom";

              return (
                <div
                  key={plan.id}
                  className={`relative overflow-hidden rounded-2xl border ${isCurrent
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
                      : "border-border bg-card"
                    } shadow-sm`}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-24 ${isCurrent
                        ? "bg-gradient-to-r from-emerald-200 via-emerald-100 to-transparent dark:from-emerald-900/40 dark:via-emerald-950/20 dark:to-transparent"
                        : "bg-gradient-to-r from-amber-100 via-amber-50 to-transparent dark:from-amber-900/30 dark:via-amber-950/10 dark:to-transparent"
                      }`}
                  />
                  <div className="relative flex h-full flex-col p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          {plan.audience === "mentor" ? "Mentor Plan" : "Mentee Plan"}
                        </p>
                        <CardTitle className="text-2xl">{plan.name}</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {plan.description || "No description"}
                        </p>
                      </div>
                      {isCurrent && (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          Current
                        </Badge>
                      )}
                    </div>

                    <div className="mt-6 flex items-baseline gap-2">
                      <span className="text-3xl font-semibold">{priceLabel}</span>
                      <span className="text-sm text-muted-foreground">/ month</span>
                    </div>

                    <div className="mt-6 space-y-2 text-sm text-muted-foreground">
                      {(plan.subscription_plan_features || [])
                        .filter((feature) => feature.is_included)
                        .map((feature) => {
                          const limitLabel = feature.limit_text
                            ? feature.limit_text
                            : feature.limit_count !== null
                              ? `${feature.limit_count}${feature.subscription_features.unit ? ` ${feature.subscription_features.unit}` : ""}`
                              : feature.limit_minutes !== null
                                ? `${feature.limit_minutes} minutes`
                                : feature.limit_amount !== null
                                  ? `${feature.limit_amount}`
                                  : feature.limit_percent !== null
                                    ? `${feature.limit_percent}%`
                                    : "Included";
                          return (
                            <div key={feature.id} className="flex items-start gap-2">
                              <Check className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              <div>
                                <p className="font-medium text-foreground">
                                  {feature.subscription_features.name}
                                </p>
                                <p className="text-xs text-muted-foreground">{limitLabel}</p>
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    <div className="mt-8">
                      <Button
                        disabled={isCurrent}
                        onClick={() => handleSelectPlan(plan)}
                        className={`w-full ${isCurrent ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-primary text-primary-foreground"
                          }`}
                      >
                        {isCurrent
                          ? "Current Plan"
                          : selectingPlanId === plan.id
                            ? "Selecting..."
                            : "Select Plan"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {subscription && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {meteredUsage.length === 0 ? (
                <p className="text-sm text-muted-foreground">No usage tracking available yet.</p>
              ) : (
                meteredUsage.map((entry) => (
                  <UsageMeter
                    key={entry.feature_key}
                    name={entry.name}
                    valueType={entry.value_type}
                    usageCount={entry.usage_count}
                    usageMinutes={entry.usage_minutes}
                    usageAmount={entry.usage_amount}
                    limitCount={entry.limit_count}
                    limitMinutes={entry.limit_minutes}
                    limitAmount={entry.limit_amount}
                    limitPercent={entry.limit_percent}
                    unit={entry.unit}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
