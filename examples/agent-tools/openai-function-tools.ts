import { PsonClient, createPsonAgentToolExecutor, getPsonAgentToolDefinitions } from "@pson5/sdk";

const client = new PsonClient();
const store = { rootDir: ".pson5-store" };

export const openAiTools = getPsonAgentToolDefinitions().map((tool) => ({
  type: "function" as const,
  name: tool.name,
  description: tool.description,
  parameters: tool.input_schema
}));

const executor = createPsonAgentToolExecutor(client, store);

export async function executePsonToolCall(name: string, args: Record<string, unknown>) {
  return executor.execute({
    name: name as Parameters<typeof executor.execute>[0]["name"],
    arguments: args
  });
}
