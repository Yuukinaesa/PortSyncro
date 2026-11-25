import nextConfig from "eslint-config-next/core-web-vitals";
import pluginSecurity from "eslint-plugin-security";

export default [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "node_modules/**"
    ]
  },
  pluginSecurity.configs.recommended,
  ...nextConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "import/no-anonymous-default-export": "off",
      "security/detect-object-injection": "off"
    }
  }
];
