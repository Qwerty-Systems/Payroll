import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import base from "../../eslint.base.mjs";

export default tseslint.config(...base, {
  files: ["**/*.{ts,tsx}"],
  plugins: { "react-hooks": reactHooks },
  languageOptions: { globals: { ...globals.browser } },
  rules: { ...reactHooks.configs.recommended.rules },
});
