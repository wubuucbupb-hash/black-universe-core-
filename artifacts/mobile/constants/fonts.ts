/**
 * Font family constants for the Black Universe identity.
 *
 * - Inter (sans) for body and UI copy.
 * - Space Mono for headers, numerals, and account/identity strings — the
 *   monospace "terminal" voice that defines the brand.
 *
 * Both families are loaded in app/_layout.tsx via useFonts before the splash
 * screen is hidden.
 */
export const FONT = {
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemiBold: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
  mono: "SpaceMono_400Regular",
  monoBold: "SpaceMono_700Bold",
} as const;
