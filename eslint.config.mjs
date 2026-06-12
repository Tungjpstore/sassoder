import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [".next*/**", "**/.next*/**", ".vercel/**", "**/.vercel/**", "**/node_modules/**", "**/dist/**", "**/coverage/**", "logimail/**"]
  },
  ...nextVitals
];

export default eslintConfig;
