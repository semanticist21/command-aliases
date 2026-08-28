# React/web default

Use this only for a requested React/TypeScript web surface. For a new app, use Bun and Vite's `react-ts` template. Install and configure this baseline instead of merely documenting it:

1. Run `bun create vite <project-name> --template react-ts`. Remove the generated ESLint config and all ESLint dependencies; replace its lint script with `biome check .`. Run `bunx biome init` to create `biome.json`.
2. Run `bun add @tanstack/react-query @tanstack/react-router lucide-react class-variance-authority clsx tailwind-merge radix-ui sonner tw-animate-css` and `bun add -d tailwindcss@^4 @tailwindcss/vite@^4 @tanstack/router-plugin @biomejs/biome`. The Vite template owns `react`, `react-dom`, Vite, TypeScript, React types, and `@vitejs/plugin-react`.
3. Initialize shadcn/ui once with `bunx shadcn@latest init`, choosing the Vite template, CSS variables, `src/styles.css`, and the `@/*` import alias. Add a component only when the product needs it.
4. When a gRPC contract was selected, additionally run `bun add @connectrpc/connect @connectrpc/connect-web @bufbuild/protobuf` and create the ConnectRPC gRPC-Web transport/client boundary. Do not install these packages for a static or non-gRPC app.

Use `tanstackRouter({ target: 'react', autoCodeSplitting: true })` before `react()` in `vite.config.ts`, then add the Tailwind v4 Vite plugin. Keep file routes in `src/routes/`, commit the generated `src/routeTree.gen.ts`, and never edit it by hand. Create the minimal `src/routes/__root.tsx`, `src/router.tsx`, and `src/main.tsx` wiring for `RouterProvider` and a root `QueryClientProvider`. In `src/styles.css`, import `tailwindcss` and `tw-animate-css`. Set scripts to `dev: vite`, `typecheck: tsc --noEmit`, `lint: biome check .`, `test: bun test`, and `build: tsc --noEmit && vite build`.

Organize feature slices around route modules, components, API/query code, and mappers; keep route composition/navigation separate from feature ownership. ConnectRPC gRPC-Web owns selected gRPC transport, TanStack Query owns server/cache state, and TanStack Router owns route composition. Do not add another client-state or transport layer without a concrete need and an explicit decision.

Existing projects may use another intentional shape. Ask through `$grill-me` whether to preserve it or migrate it, then let `$harness` record the result.
