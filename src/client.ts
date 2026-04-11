/**
 * 1Password SDK client singleton.
 */

import { createClient } from "@1password/sdk";
import { OnePasswordConnect } from "@1password/connect";
import { getConfig } from "./config.js";
import { log } from "./logger.js";

type ClientShape = {
  vaults: {
    list?: (...args: any[]) => Promise<any>;
    listAll?: (...args: any[]) => Promise<any>;
  };
  items: {
    list?: (...args: any[]) => Promise<any>;
    listAll?: (...args: any[]) => Promise<any>;
    get?: (...args: any[]) => Promise<any>;
    create?: (...args: any[]) => Promise<any>;
    put?: (...args: any[]) => Promise<any>;
    delete?: (...args: any[]) => Promise<any>;
  };
  secrets?: {
    resolve?: (...args: any[]) => Promise<string>;
  };
};

type OnePasswordClient = ClientShape;
type ConnectClient = ReturnType<typeof OnePasswordConnect>;
type NormalizedClient = OnePasswordClient;

let clientPromise: Promise<NormalizedClient> | undefined;

export function buildConnectAdapter(client: ConnectClient): OnePasswordClient {
  return {
    vaults: {
      list: async () => client.listVaults(),
      listAll: async () => client.listVaults(),
    },
    items: {
      list: async (vaultId: string) => client.listItems(vaultId),
      listAll: async (vaultId: string) => client.listItems(vaultId),
      get: async (vaultId: string, itemId: string) => client.getItemById(vaultId, itemId),
      create: async (item: any) => client.createItem(item.vaultId, item),
      put: async (item: any) => client.updateItem(item.vault?.id ?? item.vaultId, item),
      delete: async (vaultId: string, itemId: string) => client.deleteItemById(vaultId, itemId),
    },
    secrets: {
      resolve: async (secretReference: string) => {
        const match = secretReference.match(/^op:\/\/([^/]+)\/([^/]+)\/(.+)$/);
        if (!match) {
          throw new Error("Invalid secret reference format.");
        }
        const [, vaultId, itemId, fieldName] = match;
        const item = await client.getItemById(vaultId, itemId);
        const fields = (item as any).fields ?? [];
        const desiredField = fieldName.toLowerCase();
        const matchField = fields.find((candidate: any) => {
          const idMatch = candidate.id?.toLowerCase() === desiredField;
          const titleMatch = candidate.title?.toLowerCase() === desiredField;
          const labelMatch = candidate.label?.toLowerCase() === desiredField;
          return idMatch || titleMatch || labelMatch;
        });
        if (!matchField) {
          throw new Error(`Field '${fieldName}' not found on item.`);
        }
        if (typeof matchField.value !== "string") {
          throw new Error("Field value is not a string and cannot be returned.");
        }
        return matchField.value;
      },
    },
  } as unknown as OnePasswordClient;
}

function requireConfiguredAuth() {
  const config = getConfig();
  if (config.authMode === "connect") {
    if (!config.connectHost || !config.connectToken) {
      log("error", "Missing Connect credentials.");
      throw new Error(
        "Connect credentials are required. Provide both --connect-host/OP_CONNECT_HOST and --connect-token/OP_CONNECT_TOKEN, or set OP_SERVICE_ACCOUNT_TOKEN.",
      );
    }
    return;
  }

  if (!config.serviceAccountToken) {
    log("error", "Missing 1Password credentials.");
    throw new Error(
      "1Password credentials are required. Provide either --service-account-token/OP_SERVICE_ACCOUNT_TOKEN or --connect-host/OP_CONNECT_HOST plus --connect-token/OP_CONNECT_TOKEN.",
    );
  }

  return;
}

/** Get (or lazily create) the 1Password SDK client. */
export async function getClient(): Promise<NormalizedClient> {
  if (!clientPromise) {
    log("debug", "Initializing 1Password client.");
    const config = getConfig();
    requireConfiguredAuth();

    if (config.authMode === "connect") {
      clientPromise = Promise.resolve(
        buildConnectAdapter(
          OnePasswordConnect({
            serverURL: config.connectHost!,
            token: config.connectToken!,
          }),
        ),
      );
    } else {
      clientPromise = createClient({
        auth: config.serviceAccountToken!,
        integrationName: config.integrationName,
        integrationVersion: config.integrationVersion,
      });
    }
  }
  return clientPromise;
}

/** Reset the client singleton (useful for testing). */
export function resetClient(): void {
  clientPromise = undefined;
}
