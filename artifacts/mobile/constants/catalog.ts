import { Feather } from "@expo/vector-icons";

import {
  AssetInputAssetType,
  type UserRegistrationCluster,
} from "@workspace/api-client-react";

type FeatherName = keyof typeof Feather.glyphMap;

export interface AssetTypeOption {
  value: AssetInputAssetType;
  label: string;
  icon: FeatherName;
}

export const ASSET_TYPES: AssetTypeOption[] = [
  { value: AssetInputAssetType.real_estate, label: "Real Estate", icon: "home" },
  { value: AssetInputAssetType.vehicle, label: "Vehicle", icon: "truck" },
  { value: AssetInputAssetType.gold_jewelry, label: "Gold & Jewelry", icon: "star" },
  { value: AssetInputAssetType.stocks, label: "Stocks", icon: "trending-up" },
  { value: AssetInputAssetType.business, label: "Business", icon: "briefcase" },
  { value: AssetInputAssetType.other, label: "Other", icon: "box" },
];

export function assetTypeMeta(value: string): AssetTypeOption {
  return (
    ASSET_TYPES.find((t) => t.value === value) ?? {
      value: AssetInputAssetType.other,
      label: "Asset",
      icon: "box",
    }
  );
}

export interface ClusterOption {
  value: UserRegistrationCluster;
  label: string;
}

export const CLUSTERS: ClusterOption[] = [
  { value: "1", label: "Universal" },
  { value: "2", label: "Sovereign" },
  { value: "3", label: "International" },
  { value: "4", label: "Nation" },
  { value: "5", label: "Institution" },
  { value: "6", label: "State" },
  { value: "7", label: "Citizen" },
  { value: "8", label: "Community" },
  { value: "9", label: "Union" },
];

export function clusterLabel(value: string | null | undefined): string {
  if (!value) return "Citizen";
  return CLUSTERS.find((c) => c.value === value)?.label ?? "Citizen";
}

export function formatCurrency(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatGravity(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  const safe = Number.isFinite(n as number) ? (n as number) : 0;
  return safe.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
