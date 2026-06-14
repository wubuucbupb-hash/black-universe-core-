import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Body, Button, Chip, Eyebrow, Heading, TextField } from "@/components/ui";
import { ASSET_TYPES } from "@/constants/catalog";
import { FONT } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import {
  getGetMyAssetSummaryQueryKey,
  getListMyAssetsQueryKey,
  useSubmitAsset,
  type AssetInputAssetType,
} from "@workspace/api-client-react";

export default function DeclareScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const submit = useSubmitAsset();

  const [assetType, setAssetType] = useState<AssetInputAssetType>(ASSET_TYPES[0].value);
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const numericValue = Number(value.replace(/[^0-9.]/g, ""));
  const canSubmit =
    Number.isFinite(numericValue) &&
    numericValue >= 1 &&
    description.trim().length >= 5;

  const webTop = Platform.OS === "web" ? 67 : 0;

  const handleSubmit = async () => {
    if (!canSubmit || submit.isPending) return;
    setError(null);
    try {
      await submit.mutateAsync({
        data: {
          assetType,
          claimedValue: numericValue,
          description: description.trim(),
          documentNote: note.trim() || null,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMyAssetsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetMyAssetSummaryQueryKey() }),
      ]);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setValue("");
      setDescription("");
      setNote("");
      setAssetType(ASSET_TYPES[0].value);
      router.push("/");
    } catch (e) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setError(
        e instanceof Error && e.message
          ? "Could not submit this asset. Please review the details and try again."
          : "Something went wrong.",
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAwareScrollViewCompat
        bottomOffset={24}
        contentContainerStyle={{
          paddingTop: insets.top + webTop + 16,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 20,
          gap: 22,
        }}
      >
        <View style={{ gap: 4 }}>
          <Eyebrow>New declaration</Eyebrow>
          <Heading size={26}>Declare an asset</Heading>
        </View>

        <View style={{ gap: 12 }}>
          <Eyebrow>Asset type</Eyebrow>
          <View style={styles.chipWrap}>
            {ASSET_TYPES.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                icon={t.icon}
                selected={assetType === t.value}
                onPress={() => setAssetType(t.value)}
              />
            ))}
          </View>
        </View>

        <TextField
          label="Claimed value (USD)"
          value={value}
          onChangeText={setValue}
          placeholder="250000"
          keyboardType="numeric"
          testID="input-value"
        />

        <TextField
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the asset (location, make, quantity…)"
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: "top" }}
          testID="input-description"
        />

        <TextField
          label="Document note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="Reference to proof of ownership"
          testID="input-note"
        />

        {error ? (
          <Text style={{ fontFamily: FONT.sans, fontSize: 13, color: c.destructive }}>
            {error}
          </Text>
        ) : (
          <Body muted>
            Submitted assets enter the verification queue. Once approved and
            deposited, gravity is issued to your account.
          </Body>
        )}

        <Button
          label="Submit for verification"
          icon="upload-cloud"
          onPress={handleSubmit}
          loading={submit.isPending}
          disabled={!canSubmit}
          testID="btn-declare"
        />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
