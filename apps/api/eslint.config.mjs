import tseslint from "typescript-eslint";
import globals from "globals";
import base from "../../eslint.base.mjs";

export default tseslint.config(...base, {
  files: ["**/*.ts"],
  languageOptions: { globals: { ...globals.node } },
});
