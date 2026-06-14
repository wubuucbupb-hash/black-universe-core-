import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Button, Card, Eyebrow, Heading } from "@/components/ui";
import {
  clusterLabel,
  formatGravity,
} from "@/constants/catalog";
import { FONT } from "@/constants/fonts";
import { useAuth } from "@/contexts/auth";
import { useColors } from "@/hooks/useColors";
import {
  useGetMatrixAccounts,
  useGetMe,
} from "@workspace/api-client-react";

export default function ProfileScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user: cachedUser, logout } = useAuth();

  const meQuery = useGetMe();
  const matrixQuery = useGetMatrixAccounts();
  const user = meQuery.data ?? cachedUser;

  const myAccount = matrixQuery.data?.accounts.find(
    (a) => user?.accountNumber && a.accountNumber === user.accountNumber,
  );

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
      >
        <View style={{ gap: 4 }}>
          <Eyebrow>Identity</Eyebrow>
          <Heading size={26}>{user?.name ?? "Citizen"}</Heading>
          <Body muted>{user?.email ?? ""}</Body>
        </View>

        <Card style={{ gap: 6 }}>
          <Eyebrow>Account number</Eyebrow>
          <Text
            style={{
              fontFamily: FONT.monoBold,
              fontSize: 20,
              color: c.primary,
              letterSpacing: 1,
            }}
          >
            {user?.accountNumber ?? "—"}
          </Text>
        </Card>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Card style={{ flex: 1, gap: 6 }}>
            <Eyebrow>Cluster</Eyebrow>
            <Text style={{ fontFamily: FONT.monoBold, fontSize: 18, color: c.foreground }}>
              {clusterLabel(myAccount?.cluster)}
            </Text>
          </Card>
          <Card style={{ flex: 1, gap: 6 }}>
            <Eyebrow>Gravity</Eyebrow>
            <Text style={{ fontFamily: FONT.monoBold, fontSize: 18, color: c.primary }}>
              {formatGravity(myAccount?.gravityBalance)}
            </Text>
          </Card>
        </View>

        <Row icon="shield" label="Role" value={user?.role ?? "user"} />
        {user?.phoneNumber ? (
          <Row icon="phone" label="Phone" value={user.phoneNumber} />
        ) : null}

        <View style={{ marginTop: 8 }}>
          <Button label="Sign out" icon="log-out" variant="outline" onPress={logout} testID="btn-logout" />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  const c = useColors();
  return (
    <View style={[styles.row, { borderColor: c.border, borderRadius: c.radius, backgroundColor: c.card }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Feather name={icon} size={16} color={c.mutedForeground} />
        <Text style={{ fontFamily: FONT.sans, fontSize: 14, color: c.mutedForeground }}>
          {label}
        </Text>
      </View>
      <Text style={{ fontFamily: FONT.sansSemiBold, fontSize: 14, color: c.foreground }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
});
