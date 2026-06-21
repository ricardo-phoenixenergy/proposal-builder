import Ajv2020 from "ajv/dist/2020.js";

/**
 * Shared Ajv instance configured for draft 2020-12 (the dialect declared by our
 * schemas). `allErrors` so the export gate can list every offending field at
 * once; `strict: false` because we build schemas dynamically from the registry
 * and don't want strict-mode meta-warnings on valid combinations.
 */
export const ajv = new Ajv2020({ allErrors: true, strict: false });
