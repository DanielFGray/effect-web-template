// @ts-check
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import dotenv from "dotenv";
import prompts from "prompts";

const DOTENV_PATH = path.resolve(".env");

/** validates database name
 * @param {string} str database name
 * @returns {true | string} returns true or an error
 */
function validName(str) {
  if (str.length < 4) return "must be at least 4 characters";
  if (str !== str.toLowerCase()) return "must be lowercase";
  return true;
}

/** generates a password
 * @param {number} length password length
 * @param {BufferEncoding} type password encoding
 * @returns {string} generated password
 */
function generatePassword(length, type = "base64") {
  return crypto.randomBytes(length).toString(type).replace(/\W/g, "_");
}

async function readDotenv() {
  try {
    return dotenv.parse(await fs.readFile(DOTENV_PATH, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {null | Record<string,string | undefined>} config current environment object
 * @returns {Promise<void>} void
 */
async function createConfig() {
  const packageJson = JSON.parse(await fs.readFile("./package.json", "utf8"));
  const packageName = (
    packageJson?.name || import.meta.dirname.split("/").at(-1)
  )
    .replace(/\W/g, "_")
    .replace(/__+/g, "")
    .replace(/^_/, "");

  const config = await readDotenv()
  if (
    config &&
    config.AUTH_DATABASE_URL &&
    config.DATABASE_AUTHENTICATOR &&
    config.DATABASE_AUTHENTICATOR_PASSWORD &&
    config.DATABASE_HOST &&
    config.DATABASE_NAME &&
    config.DATABASE_OWNER &&
    config.DATABASE_OWNER_PASSWORD &&
    config.DATABASE_PORT &&
    config.DATABASE_URL &&
    config.DATABASE_VISITOR &&
    config.NODE_ENV &&
    config.PORT &&
    config.ROOT_DATABASE_PASSWORD &&
    config.ROOT_DATABASE_URL &&
    config.ROOT_DATABASE_USER &&
    config.ROOT_URL &&
    config.SECRET &&
    config.SHADOW_DATABASE_PASSWORD &&
    config.SHADOW_DATABASE_URL &&
    config.TEST_DATABASE_PASSWORD &&
    config.TEST_DATABASE_URL
  ) {
    console.info(".env file untouched");
    process.exit(0);
  }

  prompts.override(config)
  const {
    ROOT_DATABASE_USER,
    DATABASE_HOST,
    DATABASE_PORT,
    DATABASE_NAME,
  } = await prompts(
    [
      {
        type: "text",
        name: "ROOT_DATABASE_USER",
        message: "superuser database username:",
        initial: "postgres",
      },
      {
        type: "text",
        name: "DATABASE_PORT",
        message: "database port:",
        initial: "5432",
      },
      {
        type: "text",
        name: "DATABASE_HOST",
        message: "database host:",
        initial: "localhost",
      },
      {
        type: "text",
        name: "DATABASE_NAME",
        message: "database name:",
        initial: packageName,
        validate: validName,
      },
    ]
  )
  const {
    DATABASE_OWNER,
    DATABASE_AUTHENTICATOR,
    DATABASE_VISITOR,
    PORT,
    ROOT_URL
  } = await prompts([
      {
        type: "text",
        name: "DATABASE_OWNER",
        message: "database username:",
        initial: () => DATABASE_NAME,
      },
      {
        type: "text",
        name: "DATABASE_AUTHENTICATOR",
        message: "authenticator role name:",
        initial: () => `${DATABASE_NAME}_authenticator`,
      },
      {
        type: "text",
        name: "DATABASE_VISITOR",
        message: "visitor role name:",
        initial: () => `${DATABASE_NAME}_visitor`,
      },
      {
        type: "text",
        name: "PORT",
        message: "backend server port:",
        initial: "3000",
      },
      {
        type: "text",
        name: "ROOT_URL",
        message: "public url:",
        initial: () => `http://localhost:5173`,
      },
    ],
  );

  const { autoGenPasswords } = await prompts({
    name: "autoGenPasswords",
    type: "confirm",
    message: 'auto-generate passwords?',
    initial: true,
  })

  if (autoGenPasswords) prompts.override(Object.assign({}, config, {
    ROOT_DATABASE_PASSWORD: generatePassword(18),
    DATABASE_OWNER_PASSWORD: generatePassword(18),
    DATABASE_AUTHENTICATOR_PASSWORD: generatePassword(18),
    SHADOW_DATABASE_PASSWORD: generatePassword(18),
    TEST_DATABASE_PASSWORD: generatePassword(18),
    SECRET: generatePassword(32),
  }))
  const PASSWORDS = await prompts(
    [
      {
        type: "text",
        name: "ROOT_DATABASE_PASSWORD",
        message: "ROOT_DATABASE_PASSWORD",
        initial: () => generatePassword(18),
      },
      {
        type: "text",
        name: "DATABASE_OWNER_PASSWORD",
        message: "DATABASE_OWNER_PASSWORD",
        initial: () => generatePassword(18),
      },
      {
        type: "text",
        name: "DATABASE_AUTHENTICATOR_PASSWORD",
        message: "DATABASE_AUTHENTICATOR_PASSWORD",
        initial: () => generatePassword(18),
      },
      {
        type: "text",
        name: "SHADOW_DATABASE_PASSWORD",
        message: "SHADOW_DATABASE_PASSWORD",
        initial: () => generatePassword(18),
      },
      {
        type: "text",
        name: "TEST_DATABASE_PASSWORD",
        message: "TEST_DATABASE_PASSWORD",
        initial: () => generatePassword(18),
      },
      {
        type: "text",
        name: "SECRET",
        message: "SECRET (used for signing tokens):",
        initial: () => generatePassword(32),
      },
    ],
  );

  const envFile = Object.entries({
    ...config,
    NODE_ENV: "development",
    ROOT_DATABASE_USER: ROOT_DATABASE_USER,
    ROOT_DATABASE_PASSWORD: PASSWORDS.ROOT_DATABASE_PASSWORD,
    ROOT_DATABASE_URL: `postgres://${ROOT_DATABASE_USER}:${PASSWORDS.ROOT_DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/template1`,
    DATABASE_HOST: DATABASE_HOST,
    DATABASE_PORT: DATABASE_PORT,
    DATABASE_NAME: DATABASE_NAME,
    DATABASE_OWNER: DATABASE_OWNER,
    DATABASE_OWNER_PASSWORD: PASSWORDS.DATABASE_OWNER_PASSWORD,
    DATABASE_URL: `postgres://${DATABASE_OWNER}:${PASSWORDS.DATABASE_OWNER_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`,
    DATABASE_AUTHENTICATOR: DATABASE_AUTHENTICATOR,
    DATABASE_AUTHENTICATOR_PASSWORD: PASSWORDS.DATABASE_AUTHENTICATOR_PASSWORD,
    TEST_DATABASE_PASSWORD: PASSWORDS.TEST_DATABASE_PASSWORD,
    SHADOW_DATABASE_PASSWORD: PASSWORDS.SHADOW_DATABASE_PASSWORD,
    SHADOW_DATABASE_URL: `postgres://${DATABASE_NAME}_shadow:${PASSWORDS.SHADOW_DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}_shadow`,
    TEST_DATABASE_URL: `postgres://${DATABASE_NAME}_test:${PASSWORDS.TEST_DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}_test`,
    AUTH_DATABASE_URL: `postgres://${DATABASE_AUTHENTICATOR}:${PASSWORDS.DATABASE_AUTHENTICATOR_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`,
    DATABASE_VISITOR: DATABASE_VISITOR,
    SECRET: PASSWORDS.SECRET,
    PORT,
    ROOT_URL,
  })
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
    .concat("\n");

  await fs.writeFile(DOTENV_PATH, envFile, "utf8");
  console.log(`.env file ${config ? "updated" : "created"}`);
}

async function main() {
  createConfig();
}

main();
