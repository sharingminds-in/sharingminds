-- Enable analytics_dashboard feature for mentor_gold plan.
-- The feature existed in the plan but was set to is_included = false.
UPDATE subscription_plan_features
SET is_included = true,
    updated_at   = now()
WHERE plan_id   = (SELECT id FROM subscription_plans  WHERE plan_key    = 'mentor_gold')
  AND feature_id = (SELECT id FROM subscription_features WHERE feature_key = 'analytics_dashboard');
