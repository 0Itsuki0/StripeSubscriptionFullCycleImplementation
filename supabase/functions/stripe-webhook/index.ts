import "@supabase/functions-js/edge-runtime.d.ts"

import Stripe from "stripe"
import { createClient, SupabaseClient } from "@supabase/supabase-js"

import { Database, SubscriptionPlan } from "../_shared/types/database.types.ts"
import { buildErrorResponse } from "../_shared/utils.ts"
import { ERROR_CODE } from "../_shared/types/error-code.ts"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {})

const supabaseClient: SupabaseClient<Database> = createClient<Database>(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

Deno.serve(async (req) => {
    const signature = req.headers.get("stripe-signature")
    if (!signature) {
        return buildErrorResponse("Unauthorized", ERROR_CODE.NOT_AUTHORIZED)
    }
    let event: Stripe.Event

    // raw request required
    const raw = await req.text()
    try {
        event = await stripe.webhooks.constructEventAsync(
            raw,
            signature,
            Deno.env.get("STRPIE_ENDPOINT_SECRET") ?? "",
        )
    } catch (error) {
        return buildErrorResponse(error, ERROR_CODE.BAD_REQUEST)
    }

    console.log(event.type)
    console.log(event)

    try {
        await handleStripeEvent(event)
    } catch (error) {
        console.error(error)
    }

    return new Response(null, { status: 200 })
})

async function handleStripeEvent(event: Stripe.Event) {
    switch (event.type) {
        // 1. handle subscription created programatically fo handling
        // donwgrading to free plan on payment failure either due to
        // - trialing end without a valid payment method or
        // - recurring payment fail
        // 2. Handle successful checkout using checkout session
        case "customer.subscription.created": {
            const subscription: Stripe.Subscription = event.data.object
            const plan = await getPlanDetails(subscription)
            await updateEntitlement(subscription, plan)
            break
        }
        case "customer.subscription.updated": {
            const subscription: Stripe.Subscription = event.data.object

            // get whether trial is used or not from DB before updating the subscription
            const trialUsed = await isTrialUsed(customerToId(subscription.customer))

            // using the previous_attributes instead of the subscription object for getting trial end
            // because the trial end for the subscription will be automatically set to `now` when upgrading
            const leftOverTrialSeconds = getLeftoverTrial(event.data.previous_attributes)

            const plan = await getPlanDetails(subscription)
            await updateEntitlement(subscription, plan)

            // recurring payment failed after all retries: downgrade to the free plan
            if (subscription.status === "unpaid") {
                await handlePaymentFailure(subscription, plan)
                break
            }
            // Check whether if we need to manually apply a trial, for example, When upgrading from free to paid plan
            // - has the user already used the trial?
            // - does the new plan has a trial defined?
            // - does the subscription already has a trial defined.
            if (
                subscription.status === "active" && !trialUsed && plan.trial_period_days !== null &&
                subscription.trial_end !== null
            ) {
                console.log("Trial unused")
                await applyTrial(subscription, plan.trial_period_days * 24 * 60 * 60)
                break
            }
            // check whether there is left over trial or not and the plan switching to indeed support trials
            // for example, upgrading from Pro (Monthly) to Pro (Annual) without finishing the trial period
            if (subscription.status === "active" && leftOverTrialSeconds > 0 && plan.trial_period_days !== null) {
                console.log("Trial left over")
                const secondsToApply = Math.min(plan.trial_period_days * 24 * 60 * 60, leftOverTrialSeconds)
                await applyTrial(subscription, secondsToApply)
                break
            }

            break
        }
        // triggered when
        // - cancel at the end of the period and the end reached
        // - we cancel a subscription programatically due to payment failure
        case "customer.subscription.deleted": {
            const subscription: Stripe.Subscription = event.data.object
            await removeEntitlementSubscription(subscription)
            break
        }
        // trail ended without a valid payment method (when missing_payment_method is to pause)
        case "customer.subscription.paused": {
            const subscription = event.data.object
            const plan = await getPlanDetails(subscription)
            await handlePaymentFailure(subscription, plan)
            break
        }
        default:
            console.log(`Unhandled event type ${event.type}.`)
    }
}

async function applyTrial(subscription: Stripe.Subscription, seconds: number) {
    const trialEnd = timstampSeconds() + seconds
    await stripe.subscriptions.update(
        subscription.id,
        {
            proration_behavior: "create_prorations",
            trial_end: trialEnd,
            trial_settings: {
                end_behavior: {
                    missing_payment_method: "pause",
                },
            },
        },
    )
}

function timstampSeconds(): number {
    return Math.floor(Date.now() / 1000)
}

function getLeftoverTrial(subscription: Partial<Stripe.Subscription> | undefined): number {
    if (!subscription) {
        return 0
    }
    if (!subscription.trial_end) {
        return 0
    }
    return subscription.trial_end - timstampSeconds()
}

async function isTrialUsed(customerId: string): Promise<boolean> {
    const { data, error } = await supabaseClient.from("user_entitlements").select("*").eq(
        "stripe_customer_id",
        customerId,
    )
    if (error) {
        console.error(error)
        return true
    }
    if (data.length === 0) {
        return false
    }
    return data[0].trial_used
}

// Handle two scenerios
// 1. Trial end without valid payment method
// 2. Recurring payment collection failed after all retires
//
// Process
// 1. cancel the current subscription
// 2. Create a downgrade new one for the free plan
async function handlePaymentFailure(
    // previousAttibutes: Partial<Stripe.Subscription> | undefined,
    subscription: Stripe.Subscription,
    plan: SubscriptionPlanExpand,
) {
    // mark invoice as uncollectible
    // continue the processing regardless of success
    if (subscription.latest_invoice) {
        try {
            await markInvoiceUncollectable(invoiceToId(subscription.latest_invoice))
        } catch (error) {
            console.error(error)
        }
    }

    // cancel current
    await cancelSubscription(subscription.id)

    // create new to start the free plan for cancellation on trailing
    if (!plan.downgrade_plan) {
        return
    }
    const customerId = customerToId(subscription.customer)
    console.log("creating subscription (Free Plan) for trail cancellation. Customer ID: ", customerId)
    await createSubscription(customerId, plan.downgrade_plan.price_id)
}

function customerToId(customer: string | Stripe.Customer | Stripe.DeletedCustomer): string {
    if (typeof customer === "string") {
        return customer
    }
    return customer.id
}

function productToId(product: string | Stripe.Product | Stripe.DeletedProduct | null): string {
    if (product === null) {
        throw new Error("Product is null")
    }
    if (typeof product === "string") {
        return product
    }
    return product.id
}

function priceToId(price: string | Stripe.Price | Stripe.DeletedPrice): string {
    if (typeof price === "string") {
        return price
    }
    return price.id
}

function invoiceToId(invoice: string | Stripe.Invoice): string {
    if (typeof invoice === "string") {
        return invoice
    }
    return invoice.id
}

function timeStampToISO(timestamp: number): string {
    // second to millisecond
    const dateObject: Date = new Date(timestamp * 1000)
    return dateObject.toISOString()
}

import { MergeDeep } from "type-fest"

type SubscriptionPlanExpand = MergeDeep<SubscriptionPlan, {
    downgrade_plan: SubscriptionPlan | null
}>

async function getPlanDetails(subscription: Stripe.Subscription): Promise<SubscriptionPlanExpand> {
    const subscriptionItems = subscription.items.data
    if (subscriptionItems.length === 0) {
        throw new Error("No subscription item available.")
    }

    const subscriptionItem: Stripe.SubscriptionItem = subscriptionItems[0]

    const { data, error } = await supabaseClient.from("subscription_plans")
        .select(`
            *,
            downgrade_plan:downgrade_plan_id (
                *
            )
            `)
        .eq("price_id", subscriptionItem.price.id)
        .eq("product_id", productToId(subscriptionItem.price.product))
        .eq(
            "is_active",
            true,
        )

    if (error) {
        console.error(error)
        throw error
    }
    if (data.length === 0) {
        throw new Error("No active plan found for the give id.")
    }

    return data[0]
}

type Entitlement = Database["public"]["Tables"]["user_entitlements"]

async function makeEntitlementData(
    subscription: Stripe.Subscription,
    plan: SubscriptionPlanExpand,
): Promise<Entitlement["Update"]> {
    const customerId: string = customerToId(subscription.customer)

    const data = subscription.items.data
    if (data.length === 0) {
        throw new Error("No subscription item available.")
    }

    const subscriptionItem: Stripe.SubscriptionItem = data[0]

    const nextPeriodPlanId = await getNextPeriodPlanId(subscription, plan.id)
    console.log("nextPeriodPlanId: ", nextPeriodPlanId)

    const entitlementData: Entitlement["Update"] = {
        plan_id: plan.id,
        subscription_id: subscription.id,
        stripe_customer_id: customerId,
        subscription_status: subscription.status,
        current_period_start: timeStampToISO(
            subscriptionItem.current_period_start,
        ),
        current_period_end: timeStampToISO(
            subscriptionItem.current_period_end,
        ),
        cancel_at: subscription.cancel_at
            ? timeStampToISO(
                subscription.cancel_at,
            )
            : null,
        trial_end: subscription.trial_end
            ? timeStampToISO(
                subscription.trial_end,
            )
            : null,
        next_period_plan_id: nextPeriodPlanId ?? null,
    }
    if (subscription.trial_start !== null) {
        entitlementData.trial_used = true
    }

    return entitlementData
}

async function getNextPeriodPlanId(
    subscription: Stripe.Subscription,
    currentPlanId: number,
): Promise<number | undefined> {
    if (subscription.cancel_at) {
        return undefined
    }

    let schedule = subscription.schedule
    // no scheduled upgrade/downgrade
    if (schedule === null) {
        return currentPlanId
    }

    if (typeof schedule === "string") {
        schedule = await stripe.subscriptionSchedules.retrieve(schedule)
    }

    const phases = schedule.phases
    let targetPhase: Stripe.SubscriptionSchedule.Phase | undefined = undefined
    // get the first future phase
    for (const phase of phases) {
        if (phase.start_date > timstampSeconds()) {
            targetPhase = phase
            break
        }
    }

    if (!targetPhase) {
        return currentPlanId
    }

    const items = targetPhase.items
    if (items.length === 0) {
        return currentPlanId
    }
    const item = items[0]

    try {
        const { data, error } = await supabaseClient.from("subscription_plans")
            .select("id")
            .eq("price_id", priceToId(item.price))
            .eq(
                "is_active",
                true,
            )

        if (error) {
            console.error(error)
            throw error
        }
        if (data.length === 0) {
            throw new Error("No active plan found for the give id.")
        }

        return data[0].id
    } catch (error) {
        console.error(error)
        return currentPlanId
    }
}

async function updateEntitlement(
    subscription: Stripe.Subscription,
    plan: SubscriptionPlanExpand,
) {
    console.log(subscription)

    const entitlementData = await makeEntitlementData(subscription, plan)

    const { error } = await supabaseClient.from("user_entitlements").update(entitlementData)
        .eq("stripe_customer_id", customerToId(subscription.customer))

    if (error) {
        console.error(error)
        throw error
    }
}

async function removeEntitlementSubscription(
    subscription: Stripe.Subscription,
) {
    const { error } = await supabaseClient.from("user_entitlements").update({
        plan_id: null,
        subscription_id: null,
        subscription_status: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at: null,
        trial_end: null,
    })
        .eq("subscription_id", subscription.id)

    if (error) {
        console.error(error)
        throw error
    }
}

async function createSubscription(customerId: string, priceId: string) {
    const _ = await stripe.subscriptions.create({
        customer: customerId,
        items: [
            {
                price: priceId,
            },
        ],
    })
    // reason we are not updating here but listen for customer.subscription.created event
    // Since we are deleting before creating, the delete event will coming in as customer.subscription.deleted
    // if we update with the new subscription here, it will be overwritten by the delete event that come into the webhook
}

async function cancelSubscription(subscriptionId: string) {
    const _ = await stripe.subscriptions.cancel(
        subscriptionId,
        {
            // Will generate a proration invoice item that credits remaining unused time until the subscription period end. Defaults to false.
            prorate: false,
        },
    )
}

async function markInvoiceUncollectable(invoiceId: string) {
    const _ = await stripe.invoices.markUncollectible(
        invoiceId,
    )
}
