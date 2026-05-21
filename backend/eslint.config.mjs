import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
            },
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off",
            "no-undef": "error",
            "no-restricted-syntax": [
                "error",
                {
                    "selector": "CallExpression[callee.name='authorize']",
                    "message": "The 'authorize' middleware is deprecated. Use 'checkPermission' instead."
                }
            ]
        },
    },
    {
        files: ["src/controllers/**/*.js", "src/modules/**/controllers/**/*.js"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["**/models", "**/models/**"],
                            message: "Controllers must not import models directly. Use module repositories/use-cases."
                        }
                    ]
                }
            ]
        }
    }
];
