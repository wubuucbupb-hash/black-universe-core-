import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";

import { FONT } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";

type FeatherName = keyof typeof Feather.glyphMap;

/* ---------------------------------------------------------------- Text ----- */

export function Eyebrow({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <Text
      style={{
        fontFamily: FONT.mono,
        fontSize: 11,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: c.mutedForeground,
      }}
    >
      {children}
    </Text>
  );
}

export function Heading({
  children,
  size = 24,
}: {
  children: React.ReactNode;
  size?: number;
}) {
  const c = useColors();
  return (
    <Text style={{ fontFamily: FONT.monoBold, fontSize: size, color: c.foreground, letterSpacing: 0.5 }}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: ViewStyle | object;
}) {
  const c = useColors();
  return (
    <Text style={[{ fontFamily: FONT.sans, fontSize: 14, lineHeight: 20, color: muted ? c.mutedForeground : c.foreground }, style]}>
      {children}
    </Text>
  );
}

/* --------------------------------------------------------------- Button ---- */

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "ghost";
  icon?: FeatherName;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  testID,
}: ButtonProps) {
  const c = useColors();
  const isPrimary = variant === "primary";
  const isOutline = variant === "outline";

  const handlePress = () => {
    if (disabled || loading) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: c.radius,
          backgroundColor: isPrimary ? c.primary : "transparent",
          borderColor: isOutline ? c.borderStrong : "transparent",
          borderWidth: isOutline ? 1 : 0,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? c.primaryForeground : c.primary} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? (
            <Feather
              name={icon}
              size={16}
              color={isPrimary ? c.primaryForeground : c.primary}
            />
          ) : null}
          <Text
            style={{
              fontFamily: FONT.monoBold,
              fontSize: 13,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: isPrimary ? c.primaryForeground : c.primary,
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- Card ----- */

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: c.radius,
          padding: 18,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ------------------------------------------------------------- TextField ---- */

interface FieldProps extends TextInputProps {
  label: string;
}

export function TextField({ label, style, ...rest }: FieldProps) {
  const c = useColors();
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow>{label}</Eyebrow>
      <TextInput
        placeholderTextColor={c.mutedForeground}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          {
            fontFamily: FONT.sans,
            fontSize: 15,
            color: c.foreground,
            backgroundColor: c.input,
            borderWidth: 1,
            borderColor: focused ? c.primary : c.border,
            borderRadius: c.radius,
            paddingHorizontal: 14,
            paddingVertical: 13,
          },
          style,
        ]}
      />
    </View>
  );
}

/* --------------------------------------------------------------- Chip ------ */

export function Chip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: FeatherName;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") {
          Haptics.selectionAsync();
        }
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: selected ? c.primary : c.border,
        backgroundColor: selected ? c.accent : c.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon ? (
        <Feather name={icon} size={13} color={selected ? c.primary : c.mutedForeground} />
      ) : null}
      <Text
        style={{
          fontFamily: FONT.sansMedium,
          fontSize: 13,
          color: selected ? c.primary : c.mutedForeground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* --------------------------------------------------------------- Badge ----- */

export function StatusBadge({ status }: { status: string }) {
  const c = useColors();
  const map: Record<string, string> = {
    approved: c.positive,
    pending: c.warning,
    rejected: c.destructive,
  };
  const color = map[status] ?? c.mutedForeground;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: color,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text
        style={{
          fontFamily: FONT.mono,
          fontSize: 10,
          letterSpacing: 1,
          textTransform: "uppercase",
          color,
        }}
      >
        {status}
      </Text>
    </View>
  );
}

/* ---------------------------------------------------------------- Logo ----- */

export function Logo({ size = 18 }: { size?: number }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: size + 10,
          height: size + 10,
          borderRadius: (size + 10) / 2,
          borderWidth: 2,
          borderColor: c.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: size / 2.4,
            height: size / 2.4,
            borderRadius: size,
            backgroundColor: c.primary,
          }}
        />
      </View>
      <Text
        style={{
          fontFamily: FONT.monoBold,
          fontSize: size,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: c.foreground,
        }}
      >
        Black Universe
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
