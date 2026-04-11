/**
 * Tests for src/client.ts — auth selection and Connect adapter behavior.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, onePasswordConnectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  onePasswordConnectMock: vi.fn(),
}));

vi.mock("@1password/sdk", () => ({
  createClient: createClientMock,
}));

vi.mock("@1password/connect", () => ({
  OnePasswordConnect: onePasswordConnectMock,
}));

vi.mock("../src/logger.js", () => ({
  log: vi.fn(),
}));

import { getConfig, resetConfig } from "../src/config.js";
import { buildConnectAdapter, getClient, resetClient } from "../src/client.js";

describe("client auth selection", () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetConfig();
    resetClient();
    process.argv = ["node", "index.js"];
    delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
    delete process.env.OP_CONNECT_HOST;
    delete process.env.OP_CONNECT_TOKEN;
  });

  it("throws on missing credentials", async () => {
    await expect(getClient()).rejects.toThrow(/1Password credentials are required/);
  });

  it("throws on partial Connect config", () => {
    process.env.OP_CONNECT_HOST = "https://connect.example.com";
    expect(() => getConfig()).toThrow(/Partial Connect configuration/);
  });

  it("uses service account client when only service account token is present", async () => {
    process.env.OP_SERVICE_ACCOUNT_TOKEN = "service-token";
    createClientMock.mockResolvedValue({ marker: "service" });

    await expect(getClient()).resolves.toEqual({ marker: "service" });
    expect(createClientMock).toHaveBeenCalledWith({
      auth: "service-token",
      integrationName: "1password-mcp",
      integrationVersion: "2.4.1",
    });
    expect(onePasswordConnectMock).not.toHaveBeenCalled();
  });

  it("prefers Connect when both auth methods are present", async () => {
    process.env.OP_SERVICE_ACCOUNT_TOKEN = "service-token";
    process.env.OP_CONNECT_HOST = "https://connect.example.com";
    process.env.OP_CONNECT_TOKEN = "connect-token";
    onePasswordConnectMock.mockReturnValue({ listVaults: vi.fn() });

    await getClient();

    expect(onePasswordConnectMock).toHaveBeenCalledWith({
      serverURL: "https://connect.example.com",
      token: "connect-token",
    });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("adapts Connect client methods to the shared surface", async () => {
    const connectClient = {
      listVaults: vi.fn().mockResolvedValue([{ id: "v1" }]),
      listItems: vi.fn().mockResolvedValue([{ id: "i1" }]),
      getItemById: vi.fn().mockResolvedValue({
        id: "i1",
        fields: [{ id: "password", value: "secret" }],
      }),
      createItem: vi.fn(),
      updateItem: vi.fn(),
      deleteItemById: vi.fn(),
    };

    const client = buildConnectAdapter(connectClient as any);

    await expect(client.vaults.list?.()).resolves.toEqual([{ id: "v1" }]);
    await expect(client.items.list?.("vault-1")).resolves.toEqual([{ id: "i1" }]);
    await expect(client.secrets?.resolve?.("op://vault-1/item-1/password")).resolves.toBe("secret");

    expect(connectClient.listVaults).toHaveBeenCalled();
    expect(connectClient.listItems).toHaveBeenCalledWith("vault-1");
    expect(connectClient.getItemById).toHaveBeenCalledWith("vault-1", "item-1");
  });
});
