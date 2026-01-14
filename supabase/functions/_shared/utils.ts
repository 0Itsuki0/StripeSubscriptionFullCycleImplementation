export function errorToString(error: unknown): string {
    let message = `${String(error)}`
    if (error instanceof Error) {
        message = error.message
    }
    if (typeof error === "object") {
        if (
            error && (error as unknown as { [key: string]: unknown })["message"]
        ) {
            message = String(
                (error as unknown as { [key: string]: unknown })["message"],
            )
        } else {
            try {
                message = JSON.stringify(error)
            } catch (error) {
                console.error(error)
            }
        }
    }
    return message
}

export function buildErrorResponse(
    error: unknown,
    status: number,
): Response {
    console.error(error)
    const message = errorToString(error)
    return new Response(
        JSON.stringify({ error: message }),
        { status: status, headers: { "Content-Type": "application/json" } },
    )
}
