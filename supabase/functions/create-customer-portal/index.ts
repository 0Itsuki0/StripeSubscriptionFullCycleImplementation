import "@supabase/functions-js/edge-runtime.d.ts"

import Stripe from "stripe"
import { createClient, SupabaseClient } from "@supabase/supabase-js"

import { Database } from "../_shared/types/database.types.ts"
import { buildErrorResponse } from "../_shared/utils.ts"
import { ERROR_CODE } from "../_shared/types/error-code.ts"

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

    const portalId = await getPortalId(supabaseClient)
    const customerId = await getCustomerId(supabaseClient)

    if (!customerId) {
        try {
            await verifyUser(supabaseClient)
        } catch (error) {
            return buildErrorResponse(error, ERROR_CODE.NOT_AUTHORIZED)
        }
    }

    try {
        const session = await createPortalSession(portalId, customerId)
        return new Response(
            JSON.stringify(session),
            { headers: { "Content-Type": "application/json" } },
        )
    } catch (error) {
        return buildErrorResponse(error, ERROR_CODE.BAD_REQUEST)
    }
})

async function verifyUser(supabaseClient: SupabaseClient<Database>): Promise<void> {
    const { error } = await supabaseClient.auth.getUser()
    if (error) {
        console.error(error)
        throw error
    }
    return
}

async function getCustomerId(supabaseClient: SupabaseClient<Database>): Promise<string | undefined> {
    try {
        const { data, error } = await supabaseClient.from("user_entitlements").select("stripe_customer_id")
        if (error) {
            throw error
        }
        if (data.length === 0) {
            throw new Error("No entitlement found for user.")
        }

        return data[0].stripe_customer_id ?? undefined
    } catch (error) {
        console.error(error)
        return undefined
    }
}

async function getPortalId(supabaseClient: SupabaseClient<Database>): Promise<string | undefined> {
    try {
        const { data, error } = await supabaseClient.from("customer_portal_configurations").select("id").eq(
            "is_active",
            true,
        )
        if (error) {
            throw error
        }
        if (data.length === 0) {
            throw new Error("No active portal found.")
        }

        return data[0].id
    } catch (error) {
        console.error(error)
        return undefined
    }
}

async function createPortalSession(
    portalId: string | undefined,
    customerId: string | undefined,
): Promise<Stripe.Response<Stripe.BillingPortal.Session>> {
    const session = await stripe.billingPortal.sessions.create({
        configuration: portalId,
        customer: customerId,
    })
    return session
}
