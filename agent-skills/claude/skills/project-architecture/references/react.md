# React/web default

Use this only for a requested React/TypeScript web surface. Organize feature slices around route modules, components, API/query code, and mappers; keep route composition/navigation separate from feature ownership.

For a selected gRPC contract, ConnectRPC gRPC-Web owns transport, TanStack Query owns server/cache state, and TanStack Router owns route composition. Do not add another client-state or transport layer without a concrete need and an explicit decision.

Existing projects may use another intentional shape. Ask through `$grill-me` whether to preserve it or migrate it, then let `$harness` record the result.
