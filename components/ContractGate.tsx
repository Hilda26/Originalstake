import type { ReactNode } from "react";
import { ShieldOff } from "lucide-react";
import { isContractConfigured, chainName } from "@/lib/config";
import { EmptyState } from "./EmptyState";

export function ContractGate({ children }: { children: ReactNode }) {
  if (isContractConfigured) return <>{children}</>;
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <EmptyState
        icon={<ShieldOff size={32} aria-hidden="true" />}
        title="No contract configured yet"
        description={`This deployment doesn't have an OriginalStake contract address set for ${chainName}. Set NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS in your environment once the contract is deployed - nothing here is faked or mocked in the meantime.`}
      />
    </div>
  );
}
