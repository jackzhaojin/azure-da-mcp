import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";

/**
 * Mesh-aware A2A client factory: injects `Authorization: Bearer <A2A_MESH_TOKEN>`
 * into every transport request when a token is configured. Agent Cards stay
 * public, so discovery needs no auth.
 */
export function meshClientFactory(token: string | undefined = process.env.A2A_MESH_TOKEN): ClientFactory {
  const fetchImpl: typeof fetch = token
    ? (input, init = {}) =>
        fetch(input, {
          ...init,
          headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
        })
    : fetch;
  return new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl })] });
}
