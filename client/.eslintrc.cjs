module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
  ],
  plugins: ["react", "tailwindcss"],
  settings: { react: { version: "detect" } },
  rules: {
    "react/prop-types": "off",
    "tailwindcss/classnames-order": "warn",
    "tailwindcss/no-custom-classname": "off",
  },
};
