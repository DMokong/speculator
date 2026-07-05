import { alphaMain } from "./alpha";

export const betaHandler = (raw: string): string => alphaMain(raw.trim());

export interface BetaConfig {
  retries: number;
}

export type BetaResult = { ok: boolean };
