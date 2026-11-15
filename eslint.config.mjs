// eslint-config-next 16 ships flat configs; wrapping them in FlatCompat made `eslint .` crash
// ("Converting circular structure to JSON") before linting anything.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
