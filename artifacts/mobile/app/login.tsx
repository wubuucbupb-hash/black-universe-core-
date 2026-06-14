import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Body, Button, Chip, Eyebrow, Heading, Logo, TextField } from "@/components/ui";
import { CLUSTERS } from "@/constants/catalog";
import { FONT } from "@/constants/fonts";
import { useAuth } from "@/contexts/auth";
import { useColors } from "@/hooks/useColors";
import type { UserRegistrationCluster } from "@workspace/api-client-react";

type Mode = "login" | "register";

export default function LoginScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [cluster, setCluster] = useState<UserRegistrationCluster>("7");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === "register";
  const webTop = Platform.OS === "web" ? 67 : 0;

  const canSubmit = isRegister
    ? name.trim().length >= 2 && email.includes("@") && password.length >= 6
    : email.includes("@") && password.length >= 1;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isRegister) {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          phoneNumber: phoneNumber.trim() || null,
          cluster,
        });
      } else {
        await login({ email: email.trim(), password });
      }
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      const fallback = isRegister
        ? "Could not create your account. The email may already be registered."
        : "Invalid email or password.";
      setError(e instanceof Error && e.message ? humanize(e.message, fallback) : fallback);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setError(null);
    setMode(isRegister ? "login" : "register");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAwareScrollViewCompat
        bottomOffset={24}
        contentContainerStyle={{
          paddingTop: insets.top + webTop + 48,
          paddingBottom: insets.bottom + 48,
          paddingHorizontal: 24,
          gap: 28,
        }}
      >
        <View style={{ gap: 14 }}>
          <Logo size={20} />
          <Heading size={30}>
            {isRegister ? "Join the\nNetwork" : "Enter the\nUniverse"}
          </Heading>
          <Body muted>
            {isRegister
              ? "Declare your assets, anchor them to gravity, and take your place in the matrix."
              : "Sign in to track your verified asset value and gravity balance."}
          </Body>
        </View>

        <View style={{ gap: 16 }}>
          {isRegister ? (
            <TextField
              label="Full name"
              value={name}
              onChangeText={setName}
              placeholder="Ada Lovelace"
              autoCapitalize="words"
              testID="input-name"
            />
          ) : null}

          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@domain.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="input-email"
          />

          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            testID="input-password"
          />

          {isRegister ? (
            <>
              <TextField
                label="Phone (optional)"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="+1 555 000 0000"
                keyboardType="phone-pad"
                testID="input-phone"
              />
              <View style={{ gap: 10 }}>
                <Eyebrow>Cluster</Eyebrow>
                <View style={styles.chipWrap}>
                  {CLUSTERS.map((cl) => (
                    <Chip
                      key={cl.value}
                      label={`${cl.value} · ${cl.label}`}
                      selected={cluster === cl.value}
                      onPress={() => setCluster(cl.value)}
                    />
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {error ? (
            <Text style={{ fontFamily: FONT.sans, fontSize: 13, color: c.destructive }}>
              {error}
            </Text>
          ) : null}

          <Button
            label={isRegister ? "Create account" : "Sign in"}
            icon="arrow-right"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
            testID="btn-submit"
          />
        </View>

        <Pressable onPress={toggleMode} style={{ alignItems: "center", paddingVertical: 4 }}>
          <Text style={{ fontFamily: FONT.sans, fontSize: 13, color: c.mutedForeground }}>
            {isRegister ? "Already a citizen? " : "New here? "}
            <Text style={{ color: c.primary, fontFamily: FONT.sansSemiBold }}>
              {isRegister ? "Sign in" : "Create an account"}
            </Text>
          </Text>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function humanize(message: string, fallback: string): string {
  // Strip the "HTTP 4xx ...:" prefix from ApiError messages for a cleaner UI.
  const idx = message.indexOf(":");
  if (message.startsWith("HTTP") && idx >= 0 && idx < message.length - 1) {
    return message.slice(idx + 1).trim();
  }
  if (message.startsWith("HTTP")) return fallback;
  return message;
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
