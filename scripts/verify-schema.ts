// Verifies every functionName the frontend calls actually exists in the
// deployed contract's schema, with matching arity. Run with:
//   npm run verify-schema
// Requires NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS to be set.

import { createClient, createAccount } from "genlayer-js";
import { studionet, localnet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

const CHAINS = { studionet, localnet, testnetAsimov, testnetBradbury } as const;

const CALLS: { name: string; kind: "view" | "write"; argCount: number }[] = [
  { name: "get_submission", kind: "view", argCount: 1 },
  { name: "get_submission_count", kind: "view", argCount: 0 },
  { name: "list_submission_ids", kind: "view", argCount: 0 },
  { name: "list_submissions_page", kind: "view", argCount: 2 },
  { name: "get_challenge", kind: "view", argCount: 1 },
  { name: "get_challenge_count", kind: "view", argCount: 0 },
  { name: "list_challenge_ids", kind: "view", argCount: 0 },
  { name: "list_challenges_page", kind: "view", argCount: 2 },
  { name: "list_challenges_for_submission", kind: "view", argCount: 1 },
  { name: "preview_nearest_neighbor", kind: "view", argCount: 1 },
  { name: "search_similar", kind: "view", argCount: 2 },
  { name: "get_track_record", kind: "view", argCount: 1 },
  { name: "submit", kind: "write", argCount: 1 },
  { name: "challenge", kind: "write", argCount: 1 },
  { name: "resolve_challenge", kind: "write", argCount: 1 },
  { name: "add_bounty", kind: "write", argCount: 1 },
  { name: "expire_stale_challenge", kind: "write", argCount: 1 },
];

async function main() {
  const chainKey = (process.env.NEXT_PUBLIC_GENLAYER_CHAIN?.trim() ?? "studionet") as keyof typeof CHAINS;
  const chain = CHAINS[chainKey] ?? studionet;
  const address = process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS?.trim();

  if (!address) {
    console.error("NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS is not set - nothing to verify against yet.");
    process.exit(1);
  }

  const client = createClient({ chain, account: createAccount() });
  const schema = await client.getContractSchema(address as `0x${string}`);

  let failures = 0;
  for (const call of CALLS) {
    const method = schema.methods?.[call.name];
    if (!method) {
      console.error(`MISSING: ${call.name} is not in the deployed schema`);
      failures++;
      continue;
    }
    const params = (method as { params?: unknown[] }).params ?? [];
    if (params.length !== call.argCount) {
      console.error(
        `ARITY MISMATCH: ${call.name} expects ${params.length} args in the schema, frontend calls with ${call.argCount}`,
      );
      failures++;
      continue;
    }
    console.log(`OK: ${call.name} (${call.kind}, ${params.length} args)`);
  }

  if (failures > 0) {
    console.error(`\n${failures} mismatch(es) found against the deployed schema.`);
    process.exit(1);
  }
  console.log(`\nAll ${CALLS.length} frontend call sites match the deployed schema.`);
}

main().catch((err) => {
  console.error("Schema verification failed:", err);
  process.exit(1);
});
