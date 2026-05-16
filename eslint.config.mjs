import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [".next*/**", ".vercel/**"]
  },
  ...nextVitals
];

export default eslintConfig;
