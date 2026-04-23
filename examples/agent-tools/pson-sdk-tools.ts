import { PsonClient, createPsonAgentToolExecutor, getPsonAgentToolDefinitions } from "@pson5/sdk";
import type { ProfileStoreOptions } from "@pson5/core-types";

export function createPsonSdkTools(store: ProfileStoreOptions) {
  const client = new PsonClient();
  return createPsonAgentToolExecutor(client, store);
}

export const psonToolDefinitions = getPsonAgentToolDefinitions();
