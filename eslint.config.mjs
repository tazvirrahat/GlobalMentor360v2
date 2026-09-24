import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      "generated/**",
      ".next/**",
      ".next-*/**",
      "node_modules/**",
      "globalmentor360/**",
      ".claude/**",
      ".cursor/**",
      ".superpowers/**",
      "design-review/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default config;
