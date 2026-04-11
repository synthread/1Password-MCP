/**
 * Server configuration: CLI arguments, environment variables, constants.
 */

import { LOG_LEVEL_VALUES, type LogLevel } from "./types.js";

export const SERVER_NAME = "1password-mcp";
export const SERVER_VERSION = "2.4.1";

/** Parse a `--flag value` or `--flag=value` argument from process.argv. */
function getArgValue(name: string): string | undefined {
  const flag = `--${name}`;
  const prefix = `${flag}=`;
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === flag && process.argv[i + 1]) return process.argv[i + 1];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
}

export interface ServerConfig {
  /** Resolved log level string. */
  logLevel: LogLevel;
  /** Numeric log level for fast comparison. */
  logLevelValue: number;
  /** Integration name reported to 1Password SDK. */
  integrationName: string;
  /** Integration version reported to 1Password SDK. */
  integrationVersion: string;
  /** Selected authentication mode. */
  authMode: "service-account" | "connect" | "missing";
  /** Non-secret auth source indicator. */
  authSource: "args" | "env" | "mixed" | "missing";
  /** Service account token (may be undefined until first use). */
  serviceAccountToken: string | undefined;
  /** Connect host (may be undefined when not configured). */
  connectHost: string | undefined;
  /** Connect token (may be undefined when not configured). */
  connectToken: string | undefined;
  /** Where the active credentials came from. */
  tokenSource: "args" | "env" | "mixed" | "missing";
}

let _config: ServerConfig | undefined;

/** Build and cache the server configuration. */
export function getConfig(): ServerConfig {
  if (_config) return _config;

  const logLevelRaw = (
    getArgValue("log-level") ??
    process.env.MCP_LOG_LEVEL ??
    (process.env.MCP_DEBUG ? "debug" : "info")
  ).toLowerCase() as LogLevel;

  const logLevelValue = LOG_LEVEL_VALUES[logLevelRaw] ?? LOG_LEVEL_VALUES.info;

  const integrationName =
    getArgValue("integration-name") ??
    process.env.OP_INTEGRATION_NAME ??
    SERVER_NAME;

  const integrationVersion =
    getArgValue("integration-version") ??
    process.env.OP_INTEGRATION_VERSION ??
    SERVER_VERSION;

  const connectHostFromArgs = getArgValue("connect-host");
  const connectTokenFromArgs =
    getArgValue("connect-token") ?? getArgValue("connect-auth-token");
  const connectHost = connectHostFromArgs ?? process.env.OP_CONNECT_HOST;
  const connectToken = connectTokenFromArgs ?? process.env.OP_CONNECT_TOKEN;

  const tokenFromArgs =
    getArgValue("service-account-token") ?? getArgValue("token");

  const serviceAccountToken =
    tokenFromArgs ?? process.env.OP_SERVICE_ACCOUNT_TOKEN;

  const hasConnectHost = typeof connectHost === "string";
  const hasConnectToken = typeof connectToken === "string";
  const hasServiceAccountToken = typeof serviceAccountToken === "string";

  if (hasConnectHost !== hasConnectToken) {
    throw new Error(
      "Partial Connect configuration detected. Provide both OP_CONNECT_HOST and OP_CONNECT_TOKEN, or use OP_SERVICE_ACCOUNT_TOKEN.",
    );
  }

  const connectHostSource = connectHostFromArgs
    ? "args"
    : process.env.OP_CONNECT_HOST
      ? "env"
      : "missing";
  const connectTokenSource = connectTokenFromArgs
    ? "args"
    : process.env.OP_CONNECT_TOKEN
      ? "env"
      : "missing";
  const serviceAccountTokenSource = tokenFromArgs
    ? "args"
    : process.env.OP_SERVICE_ACCOUNT_TOKEN
      ? "env"
      : "missing";

  const authMode: ServerConfig["authMode"] = hasConnectHost
    ? "connect"
    : hasServiceAccountToken
      ? "service-account"
      : "missing";

  const authSource: ServerConfig["authSource"] = hasConnectHost
    ? connectHostSource === connectTokenSource
      ? connectHostSource
      : "mixed"
    : hasServiceAccountToken
      ? serviceAccountTokenSource
      : "missing";

  const tokenSource: ServerConfig["tokenSource"] =
    authSource === "args" || authSource === "env"
      ? authSource
      : authSource === "mixed"
        ? "mixed"
        : "missing";

  _config = {
    logLevel: logLevelRaw,
    logLevelValue,
    integrationName,
    integrationVersion,
    authMode,
    authSource,
    serviceAccountToken,
    connectHost,
    connectToken,
    tokenSource,
  };

  return _config;
}

/** Reset cached config (useful for testing). */
export function resetConfig(): void {
  _config = undefined;
}
