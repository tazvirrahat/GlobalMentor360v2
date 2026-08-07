import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: ["generated/**", ".next/**", "node_modules/**", "globalmentor360/**", ".claude/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default config;
