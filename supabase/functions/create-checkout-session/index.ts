// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"

import Stripe from "stripe"
import { createClient, SupabaseClient, User } from "@supabase/supabase-js"
import { z } from "zod"

import { Database, SubscriptionPlan, UserEntitlement } from "../_shared/types/database.types.ts"
import { buildErrorResponse } from "../_shared/utils.ts"
import { ERROR_CODE } from "../_shared/types/error-code.ts"

export const CreateCheckoutSessionRequest = z.looseObject({
    planId: z.int(),
    successURL: z.string(),
    cancelledURL: z.string().optional(),
})

export type CreateCheckoutSessionRequest = z.infer<typeof CreateCheckoutSessionRequest>

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {})

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") {
        return buildErrorResponse("Method Not Allowed", 405)
    }
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
        return buildErrorResponse("Unauthorized", ERROR_CODE.NOT_AUTHORIZED)
    }

    let supabaseClient: SupabaseClient
    try {
        supabaseClient = createClient<Database>(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            // Create client with Auth context of the user that called the function.
            // This will ensure that row-level-security (RLS) policies are applied.
            {
                global: {
                    headers: { Authorization: authHeader },
                },
            },
        )
    } catch (error) {
        return buildErrorResponse(error, ERROR_CODE.NOT_AUTHORIZED)
    }

    let entitlement: UserEntitlement | undefined
    try {
        entitlement = await getCurrentEntitlement(supabaseClient)
    } catch (error) {
        return buildErrorResponse(error, ERROR_CODE.NOT_AUTHORIZED)
    }

    let customerId = entitlement?.stripe_customer_id ?? undefined

    if (!customerId) {
        try {
            const user = await getUser(supabaseClient)
            if (!user.email) {
                throw new Error("Email undefined for the user.")
            }
            customerId = await createCustomer(user.email)
            await upsertEntitlement(user.id, customerId)
        } catch (error) {
            return buildErrorResponse(error, ERROR_CODE.BAD_REQUEST)
        }
    }

    let createSessionRequest: CreateCheckoutSessionRequest
    try {
        const body = await req.json()
        createSessionRequest = CreateCheckoutSessionRequest.parse(body)
    } catch (error) {
        console.error(error)
        return buildErrorResponse(error, ERROR_CODE.BAD_REQUEST)
    }

    let plan: SubscriptionPlan
    try {
        plan = await getPlanDetails(supabaseClient, createSessionRequest.planId)
    } catch (error) {
        console.error(error)
        return buildErrorResponse(error, ERROR_CODE.BAD_REQUEST)
    }

    // check if the user has used the trial period
    const trailUsed = entitlement?.trial_used ?? false
    const trialDays: number | undefined = trailUsed ? undefined : plan.trial_period_days ?? undefined

    const checkoutSession = await createCheckoutSession(
        customerId,
        plan.price_id,
        plan.unit_amount === 0,
        trialDays,
        createSessionRequest.successURL,
        createSessionRequest.cancelledURL,
    )

    return new Response(
        JSON.stringify(checkoutSession),
        { headers: { "Content-Type": "application/json" } },
    )
})

async function getPlanDetails(supabaseClient: SupabaseClient<Database>, planId: number): Promise<SubscriptionPlan> {
    const { data, error } = await supabaseClient.from("subscription_plans").select("*").eq("id", planId).eq(
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

async function getCurrentEntitlement(supabaseClient: SupabaseClient<Database>): Promise<UserEntitlement | undefined> {
    const { data, error } = await supabaseClient.from("user_entitlements").select("*")
    if (error) {
        throw error
    }
    if (data.length === 0) {
        return undefined
    }
    return data[0]
}

async function getUser(supabaseClient: SupabaseClient<Database>): Promise<User> {
    const { data, error } = await supabaseClient.auth.getUser()
    if (error) {
        console.error(error)
        throw error
    }
    return data.user
}

async function createCheckoutSession(
    customerId: string,
    priceId: string,
    isFreePlan: boolean,
    trialPeriodDays: number | undefined,
    successURL: string,
    cancelledURL: string | undefined,
): Promise<Stripe.Response<Stripe.Checkout.Session>> {
    const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        // only one of the email or id, but not both
        customer_email: undefined,
        customer: customerId,
        line_items: [{
            price: priceId,
            quantity: 1,
        }],
        // custom URL scheme won't work
        success_url: successURL,
        // custom URL scheme won't work
        cancel_url: cancelledURL,
        expand: ["subscription"],
        subscription_data: {
            trial_period_days: trialPeriodDays,
            trial_settings: {
                end_behavior: {
                    missing_payment_method: "pause",
                },
            },
        },
        // desired behavior: ONLY not collecting the payment if it is free plan
        // `if_required`: will also not collecting any payment method if there is a free trial.
        payment_method_collection: isFreePlan ? "if_required" : "always",
    })

    return session
}

async function createCustomer(email: string): Promise<string> {
    const customer = await stripe.customers.create({
        email: email,
    })
    return customer.id
}

async function upsertEntitlement(userId: string, customerId: string) {
    // use the service role becuase user are not allowed to update entitlements themselves
    const supabaseClient: SupabaseClient<Database> = createClient<Database>(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )
    const { error } = await supabaseClient.from("user_entitlements").upsert({
        id: userId,
        stripe_customer_id: customerId,
    }, {
        onConflict: "id",
    })

    if (error) {
        console.error(error)
        throw error
    }
}
