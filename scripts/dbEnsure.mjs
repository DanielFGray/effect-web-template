// @ts-check
import postgres from "postgres";
import runAll from "npm-run-all";
import fs from "node:fs/promises"
import "dotenv/config";

/** @param {string} url */
export async function dbTest(
  url,
  { minDelay = 50, maxTries = Infinity, maxDelay = 30000, verbose = true } = {}
) {
  const sql = postgres(url, {
    connect_timeout: 3,
  });

  let attempts = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const result = await sql`select true as "test"`;
      if (result[0].test === true) break;
    } catch (e) {
      if (e.code === "28P01") {
        sql.end();
        throw e;
      }
      attempts++;
      if (attempts > maxTries) {
        sql.end();
        throw e;
      }
      if (verbose)
        console.log(
          `Database is not ready yet (attempt ${attempts}): ${e.message}`
        );
      const delay = Math.min(
        Math.floor((minDelay * 1.8 ** attempts) / 2),
        maxDelay
      );
      await new Promise(res => setTimeout(() => res(), delay));
    }
  }
  sql.end();
  return true;
}

const runAllOpts = {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  silent: true,
};

try {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set')
  }

  await runAll(["db:up"], runAllOpts)
  await dbTest(process.env.DATABASE_URL, {
    maxTries: 7,
    verbose: false,
  })
} catch (e) {
  console.error(e.message)
  runAll(["init"], runAllOpts).catch(console.error);
}