"use client";

import type { ComponentType, ReactNode } from "react";
import { LiveProvider } from "@/hooks/LiveProvider";

// Build-time gate: with NEXT_PUBLIC_FIXTURES unset this is `false ? … : LiveProvider`,
// the bundler drops the branch and the fixtures module is never included.
// (The env var must be written out literally here so DefinePlugin can fold it.)
export const DataRoot: ComponentType<{ children: ReactNode }> =
  process.env.NEXT_PUBLIC_FIXTURES === "1"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/fixtures/FixtureProvider").FixtureProvider
    : LiveProvider;
