"use client";

// Every functionName here must exist in the deployed schema — verified by
// scripts/verify-schema.ts. Do not add a call site without updating both.

import type { GenLayerClient } from "genlayer-js/types";
import type { chain } from "./config";
import { contractAddress } from "./config";
import {
  normalizeSubmission,
  normalizeChallenge,
  normalizeNeighborPreview,
  type Submission,
  type Challenge,
  type NeighborPreview,
} from "./submission";

type Client = GenLayerClient<typeof chain>;

function requireAddress(): `0x${string}` {
  if (!contractAddress) throw new Error("No contract address configured.");
  return contractAddress;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export async function getSubmission(client: Client, id: number): Promise<Submission> {
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "get_submission",
    args: [id],
  });
  return normalizeSubmission(result);
}

export async function getSubmissionCount(client: Client): Promise<number> {
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "get_submission_count",
    args: [],
  });
  return Number(result);
}

export async function listSubmissionIds(client: Client): Promise<number[]> {
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "list_submission_ids",
    args: [],
  });
  const arr = Array.isArray(result) ? result : [];
  return arr.map((v) => Number(v));
}

export async function listSubmissionsPage(client: Client, offset: number, limit: number): Promise<Submission[]> {
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "list_submissions_page",
    args: [offset, limit],
  });
  const arr = Array.isArray(result) ? result : [];
  return arr.map(normalizeSubmission);
}

export async function getChallenge(client: Client, id: number): Promise<Challenge> {
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "get_challenge",
    args: [id],
  });
  return normalizeChallenge(result);
}

export async function getChallengeCount(client: Client): Promise<number> {
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "get_challenge_count",
    args: [],
  });
  return Number(result);
}

export async function listChallengeIds(client: Client): Promise<number[]> {
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "list_challenge_ids",
    args: [],
  });
  const arr = Array.isArray(result) ? result : [];
  return arr.map((v) => Number(v));
}

export async function listChallengesPage(client: Client, offset: number, limit: number): Promise<Challenge[]> {
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "list_challenges_page",
    args: [offset, limit],
  });
  const arr = Array.isArray(result) ? result : [];
  return arr.map(normalizeChallenge);
}

export async function listChallengesForSubmission(client: Client, submissionId: number): Promise<Challenge[]> {
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "list_challenges_for_submission",
    args: [submissionId],
  });
  const arr = Array.isArray(result) ? result : [];
  return arr.map(normalizeChallenge);
}

export async function previewNearestNeighbor(client: Client, submissionId: number): Promise<NeighborPreview> {
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "preview_nearest_neighbor",
    args: [submissionId],
  });
  return normalizeNeighborPreview(result);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function submitEntry(client: Client, text: string, valueWei: bigint): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: requireAddress(),
    functionName: "submit",
    args: [text],
    value: valueWei,
  });
  return hash as `0x${string}`;
}

export async function openChallenge(
  client: Client,
  submissionId: number,
  valueWei: bigint,
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: requireAddress(),
    functionName: "challenge",
    args: [submissionId],
    value: valueWei,
  });
  return hash as `0x${string}`;
}

export async function resolveChallenge(client: Client, challengeId: number): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: requireAddress(),
    functionName: "resolve_challenge",
    args: [challengeId],
    value: 0n,
  });
  return hash as `0x${string}`;
}
