// Supabase Edge Function: Check Due Automation Rules
// This function is called by Supabase Cron Jobs to trigger automation rule execution
// It calls the FastAPI backend /api/automation/run endpoint

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const BACKEND_URL = Deno.env.get("BACKEND_URL") || ""
const CRON_SECRET = Deno.env.get("CRON_SECRET") || ""

serve(async (req) => {
  try {
    // Log the request
    console.log("Check due rules function triggered at:", new Date().toISOString())

    // Validate BACKEND_URL is configured
    if (!BACKEND_URL) {
      console.error("BACKEND_URL environment variable is not set")
      return new Response(
        JSON.stringify({ 
          error: "BACKEND_URL not configured",
          message: "Please set BACKEND_URL environment variable in Supabase Edge Function settings"
        }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    // Prepare request to FastAPI backend
    const backendUrl = `${BACKEND_URL.replace(/\/+$/, "")}/api/automation/run`
    console.log("Calling backend endpoint:", backendUrl)

    // Build headers
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    }

    // Add authorization header if CRON_SECRET is configured
    if (CRON_SECRET) {
      headers["Authorization"] = `Bearer ${CRON_SECRET}`
    }

    // Make request to FastAPI backend
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({}),
    })

    // Get response data
    const responseData = await response.json().catch(() => ({
      error: "Failed to parse response",
      status: response.status,
      statusText: response.statusText,
    }))

    // Log response
    console.log("Backend response status:", response.status)
    console.log("Backend response data:", JSON.stringify(responseData))

    // Return response
    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: "Backend request failed",
          status: response.status,
          statusText: response.statusText,
          data: responseData,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    // Success response
    return new Response(
      JSON.stringify({
        success: true,
        message: "Automation job triggered successfully",
        timestamp: new Date().toISOString(),
        result: responseData,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    // Error handling
    console.error("Error in check-due-rules function:", error)
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
})

