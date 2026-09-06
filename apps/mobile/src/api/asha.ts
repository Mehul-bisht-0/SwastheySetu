/** Authenticated reference-data calls used to prepare the offline ASHA flow. */
import { asha as ashaContracts } from "@swasthyasetu/contracts";

import { replaceVillages } from "../db/dao/villages.ts";
import { api } from "./client.ts";

export async function refreshAshaVillages(): Promise<boolean> {
  const response = await api.get<unknown>("/asha/villages");
  if (!response.ok || response.data === undefined) return false;
  try {
    const data = ashaContracts.villagesResponse.parse(response.data);
    replaceVillages(data.items);
    return true;
  } catch {
    return false;
  }
}
