import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Card, Eyebrow, Heading, StatusBadge } from "@/components/ui";
import {
  assetTypeMeta,
  formatCurrency,
  formatGravity,
} from "@/constants/catalog";
import { FONT } from "@/constants/fonts";
import { useAuth } from "@/contexts/auth";
import { useColors } from "@/hooks/useColors";
import {
  useGetMatrixAccounts,
  useGetMe,
  useGetMyAssetSummary,
  useListMyAssets,
  type Asset,
} from "@workspace/api-client-react";

export default function DashboardScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: cachedUser } = useAuth();

  const meQuery = useGetMe();
  const summaryQuery = useGetMyAssetSummary();
  const assetsQuery = useListMyAssets();
  const matrixQuery = useGetMatrixAccounts();

  const user = meQuery.data ?? cachedUser;
  const summary = summaryQuery.data;
  const assets = assetsQuery.data ?? [];

  const myAccount = matrixQuery.data?.accounts.find(
    (a) => user?.accountNumber && a.accountNumber === user.accountNumber,
  );
  const gravity = myAccount?.gravityBalance ?? "0";

  const refreshing =
    summaryQuery.isRefetching ||
    assetsQuery.isRefetching ||
    matrixQuery.isRefetching;

  const onRefresh = useCallback(() => {
    meQuery.refetch();
    summaryQuery.refetch();
    assetsQuery.refetch();
    matrixQuery.refetch();
  }, [meQuery, summaryQuery, assetsQuery, matrixQuery]);

  const loading =
    summaryQuery.isLoading || assetsQuery.isLoading || matrixQuery.isLoading;

  const webTop = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + webTop + 16,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 20,
          gap: 18,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.primary}
          />
        }
      >
        <View style={{ gap: 4 }}>
          <Eyebrow>Portfolio</Eyebrow>
          <Heading size={26}>
            {greeting()}{user?.name ? `, ${firstName(user.name)}` : ""}
          </Heading>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 64, alignItems: "center" }}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : (
          <>
            {/* Hero: combined asset value */}
            <Card style={{ padding: 22, gap: 6 }}>
              <Eyebrow>Total declared value</Eyebrow>
              <Text
                style={{
                  fontFamily: FONT.monoBold,
                  fontSize: 40,
                  color: c.foreground,
                  letterSpacing: 0.5,
                }}
              >
                {formatCurrency(summary?.totalClaimedValue)}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <Feather name="check-circle" size={13} color={c.positive} />
                <Body muted>
                  {formatCurrency(summary?.totalApprovedValue)} verified
                </Body>
              </View>
            </Card>

            {/* Gravity + counts row */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Card style={{ flex: 1, gap: 6 }}>
                <Eyebrow>Gravity</Eyebrow>
                <Text
                  style={{
                    fontFamily: FONT.monoBold,
                    fontSize: 22,
                    color: c.primary,
                  }}
                >
                  {formatGravity(gravity)}
                </Text>
                <Body muted>balance</Body>
              </Card>
              <Card style={{ flex: 1, gap: 6 }}>
                <Eyebrow>Assets</Eyebrow>
                <Text
                  style={{
                    fontFamily: FONT.monoBold,
                    fontSize: 22,
                    color: c.foreground,
                  }}
                >
                  {summary?.totalSubmitted ?? 0}
                </Text>
                <Body muted>
                  {summary?.totalPending ?? 0} pending
                </Body>
              </Card>
            </View>

            {/* Declare CTA */}
            <Pressable
              onPress={() => router.push("/declare")}
              style={({ pressed }) => [
                styles.cta,
                {
                  borderColor: c.borderStrong,
                  borderRadius: c.radius,
                  backgroundColor: c.card,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: c.radius,
                    backgroundColor: c.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="plus" size={18} color={c.primary} />
                </View>
                <View>
                  <Text style={{ fontFamily: FONT.sansSemiBold, fontSize: 15, color: c.foreground }}>
                    Declare an asset
                  </Text>
                  <Body muted>Submit a new asset for verification</Body>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color={c.mutedForeground} />
            </Pressable>

            {/* Asset list */}
            <View style={{ gap: 12, marginTop: 4 }}>
              <Eyebrow>Your assets</Eyebrow>
              {assets.length === 0 ? (
                <Card style={{ alignItems: "center", paddingVertical: 36, gap: 10 }}>
                  <Feather name="inbox" size={26} color={c.mutedForeground} />
                  <Body muted>No assets declared yet.</Body>
                </Card>
              ) : (
                assets
                  .slice()
                  .sort((a, b) => b.id - a.id)
                  .map((asset) => <AssetRow key={asset.id} asset={asset} />)
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function AssetRow({ asset }: { asset: Asset }) {
  const c = useColors();
  const meta = assetTypeMeta(asset.assetType);
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: c.radius,
          backgroundColor: c.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={meta.icon} size={18} color={c.primary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontFamily: FONT.sansSemiBold, fontSize: 15, color: c.foreground }}>
          {meta.label}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontFamily: FONT.sans, fontSize: 13, color: c.mutedForeground }}
        >
          {asset.description}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Text style={{ fontFamily: FONT.monoBold, fontSize: 15, color: c.foreground }}>
          {formatCurrency(asset.claimedValue)}
        </Text>
        <StatusBadge status={asset.status} />
      </View>
    </Card>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

const styles = StyleSheet.create({
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    padding: 14,
  },
});
