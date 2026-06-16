import nextVitals from "eslint-config-next/core-web-vitals";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = [
  {
    ignores: [".next*/**", "**/.next*/**", ".vercel/**", "**/.vercel/**", "**/node_modules/**", "**/dist/**", "**/coverage/**", "logimail/**"]
  },
  ...nextVitals,
  {
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      // Cosmetic-only: literal ' and " render fine in JSX. Disabled project-wide to
      // avoid noisy escapes across Vietnamese copy.
      "react/no-unescaped-entities": "off",
      // React Compiler advisory checks (eslint-plugin-react-hooks v6). Not classic
      // rules-of-hooks bugs — they flag optimization/purity smells. Kept as warnings
      // so lint stays green while the dashboard-v2 stream addresses them incrementally.
      // The critical rules (rules-of-hooks, exhaustive-deps) remain errors via next config.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn"
    }
  }
];

export default eslintConfig;
