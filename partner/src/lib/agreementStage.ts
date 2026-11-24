export const STAGES = ["Draft", "Sent for e-sign", "Signed", "Active", "Certificate"] as const;
export type Stage = (typeof STAGES)[number] | "Void";
/** Where an agreement stands on the way to a live partner. Void agreements sit outside the path. */
export function agreementStage(a: { status: string }, partnerStatus: string | null, hasCertificate: boolean): { stage: Stage; index: number } {
  if (a.status === "Void") return { stage: "Void", index: -1 };
  if (a.status === "Signed") {
    if (hasCertificate) return { stage: "Certificate", index: 4 };
    if (partnerStatus === "Active") return { stage: "Active", index: 3 };
    return { stage: "Signed", index: 2 };
  }
  if (a.status === "Sent") return { stage: "Sent for e-sign", index: 1 };
  return { stage: "Draft", index: 0 };
}
