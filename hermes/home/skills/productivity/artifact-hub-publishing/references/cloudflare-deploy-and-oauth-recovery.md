# Cloudflare deployment and OAuth recovery

Use this when redeploying `auth.sharosoo.com` and `artifact.sharosoo.com` from the Sharosoo monorepo, especially after an `invalid_scope` login failure.

## Root cause pattern

Artifact Hub can request `artifact:delete` through its production `artifact-web` OAuth client while the auth provider's fixed D1 client row still allows only `artifact:read` and `artifact:write`. The provider's global `scopes_supported` list is not enough: the specific `oauthClient.scopes` allowlist must include every scope requested by that client.

Before changing anything, verify both sides:

- `artifact-hub/wrangler.jsonc` (or deployed Worker vars): `OIDC_CLIENT_ID`, `OIDC_SCOPES`, `OIDC_AUDIENCE`.
- `sharosoo-world/auth/scripts/seed-clients.sql` and remote D1 `oauthClient` row for `clientId = 'artifact-web'`.

The intended split is usually:

- first-party Artifact Web: `artifact:read`, `artifact:write`, and, if the web UI needs deletion, `artifact:delete`;
- dynamically registered MCP clients/browser OAuth: read/write only;
- deletion through MCP: delete-capable PAT, not ordinary browser OAuth.

## Safe deployment sequence

1. Inspect both repositories and preserve unrelated worktree changes. Do not reset `artifact-hub` just to deploy it.
2. Confirm the shared env file has presence of (without printing values): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and auth secrets as needed.
3. Query the remote auth row before mutation:

   ```bash
   set -a; source /path/to/sharosoo-world/.env; set +a
   cd /path/to/sharosoo-world/auth
   pnpm exec wrangler d1 execute sharosoo-auth --remote \
     --command "SELECT clientId, scopes, disabled, redirectUris FROM oauthClient WHERE clientId = 'artifact-web';" --json
   ```

4. If the Artifact Web runtime really requests delete, update the fixed client seed SQL to include `artifact:delete`, then apply the idempotent seed file:

   ```bash
   pnpm exec wrangler d1 execute sharosoo-auth --remote \
     --file scripts/seed-clients.sql --json
   ```

5. Build and deploy auth with the package script, not bare `pnpm deploy` (pnpm 9 treats that as its deployment command):

   ```bash
   pnpm run deploy
   ```

6. Run Artifact Hub tests before deploying. Then source the same env and deploy:

   ```bash
   npm test
   npm run deploy
   ```

## Verification

Verify each layer independently:

- auth health: `GET https://auth.sharosoo.com/api/health` returns `{"ok":true,"app":"auth","db":"d1"}`;
- Artifact Hub root returns HTTP 200;
- `/auth/login?returnTo=%2Fsetup` redirects to the auth provider with the intended scope;
- following that authorization URL redirects to `/sign-in` or consent, not `error=invalid_scope`;
- remote D1 `artifact-web` row contains the requested scope;
- MCP unauthenticated request returns 401 with protected-resource metadata;
- authenticated MCP `list_artifacts` succeeds;
- `wrangler deployments list --name <worker> --json` shows a new 100%-traffic version.

For MCP clients, protected-resource metadata may intentionally advertise only `artifact:read` and `artifact:write` even when the first-party web login requests delete.

## Cloudflare token route warning

A deploy can upload and activate a new Worker version but still exit non-zero while updating `/zones/.../workers/routes` if the API token lacks `Workers Routes:Edit`. Treat the upload as deployed only after checking the deployment list and live HTTP endpoints. Existing custom-domain routes remain usable when they were already attached to the Worker. Do not claim a clean command exit; report the missing permission separately. To make future Wrangler runs exit zero, grant the token the required route-edit permission or use an appropriately scoped token.

## Do not do

- Do not edit generated `worker-configuration.d.ts` to fix a runtime OAuth allowlist.
- Do not remove `artifact:delete` from Artifact Hub merely to hide an auth-client registration mismatch if the web UI is intended to delete.
- Do not print `.env` contents or secrets while checking prerequisites.
- Do not call bare `pnpm deploy` when the package defines a `deploy` script; use `pnpm run deploy`.
