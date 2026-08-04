/**
 * The brand lockup lives in `@/components/brand/logo` — it is brand, not a
 * generic UI primitive, and unlike everything else in `ui/` it deliberately
 * ignores the active theme. Re-exported here so existing `@/components/ui`
 * imports keep working.
 */
export { Logo, type LogoVariant } from "@/components/brand/logo";
