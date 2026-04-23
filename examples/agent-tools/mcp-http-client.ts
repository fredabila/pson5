const baseUrl = process.env.PSON_API_BASE_URL ?? "http://localhost:3015";
const bearerToken = process.env.PSON_BEARER_TOKEN ?? "";

async function mcpRequest(method: string, params?: Record<string, unknown>, id: string | number = 1) {
  const response = await fetch(`${baseUrl}/v1/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {})
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    })
  });

  return response.json();
}

async function run() {
  console.log(await mcpRequest("initialize", { clientInfo: { name: "example-client", version: "0.1.0" } }, 1));
  console.log(await mcpRequest("tools/list", {}, 2));
  console.log(
    await mcpRequest(
      "tools/call",
      {
        name: "pson_get_agent_context",
        arguments: {
          profile_id: "pson_123",
          intent: "tutoring",
          include_predictions: true,
          max_items: 12
        }
      },
      3
    )
  );
}

void run();
