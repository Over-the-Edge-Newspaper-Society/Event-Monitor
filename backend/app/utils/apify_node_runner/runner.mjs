#!/usr/bin/env node
import { ApifyClient } from 'apify-client';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    let token = argv[i];
    if (!token.startsWith('--')) continue;
    token = token.slice(2);
    let value = 'true';
    const eqIndex = token.indexOf('=');
    if (eqIndex !== -1) {
      value = token.slice(eqIndex + 1);
      token = token.slice(0, eqIndex);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      value = argv[i + 1];
      i += 1;
    }
    args[token] = value;
  }
  return args;
}

function toInteger(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data;
}

function buildClientOptions(args) {
  const token = args.token || args.apifyToken || process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error('Missing Apify token. Provide --token or set APIFY_TOKEN.');
  }
  const options = { token };
  const baseUrl = args['base-url'] || args.baseUrl;
  if (baseUrl) {
    options.baseUrl = baseUrl;
  }
  const timeoutSecs = toNumber(args.timeoutSecs ?? args.timeoutsecs, undefined);
  if (timeoutSecs !== undefined) {
    options.timeoutSecs = timeoutSecs;
  }
  const maxRetries = toInteger(args.maxRetries ?? args.maxretries, undefined);
  if (maxRetries !== undefined) {
    options.maxRetries = maxRetries;
  }
  const minDelay = toInteger(args.minDelayBetweenRetriesMillis ?? args.mindelaybetweenretriesmillis, undefined);
  if (minDelay !== undefined) {
    options.minDelayBetweenRetriesMillis = minDelay;
  }
  return options;
}

function resolveDatasetId(run) {
  if (!run || typeof run !== 'object') return undefined;
  return (
    run.defaultDatasetId
    ?? run._defaultDatasetId
    ?? run?.data?.defaultDatasetId
    ?? run?.data?._defaultDatasetId
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const actorId = args.actor || args.actorId || args.actor_id;
  if (!actorId) {
    throw new Error('Missing Apify actor identifier. Provide --actor.');
  }

  const client = new ApifyClient(buildClientOptions(args));
  const rawInput = (await readStdin()).trim();
  let runInput = {};
  if (rawInput) {
    try {
      runInput = JSON.parse(rawInput);
    } catch (error) {
      throw new Error(`Failed to parse JSON input: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const waitSecs = toNumber(args.waitSecs ?? args.waitsecs ?? args.wait, undefined);
  const callOptions = {};
  if (waitSecs !== undefined) {
    callOptions.waitSecs = waitSecs;
  }

  const run = await client.actor(actorId).call(runInput, callOptions);
  if (!run) {
    throw new Error('Apify actor call returned no run information.');
  }
  if (run.status && !['SUCCEEDED', 'READY'].includes(run.status)) {
    throw new Error(`Apify actor finished with status ${run.status}.`);
  }

  const datasetId = resolveDatasetId(run);
  if (!datasetId) {
    process.stdout.write('[]');
    return;
  }

  const datasetClient = client.dataset(datasetId);
  const clean = args.clean !== 'false';
  const limit = toInteger(args.limit, undefined);
  const pageSize = Math.min(Math.max(toInteger(args.pageSize ?? args.page_size, 500), 1), 1000);

  const items = [];
  let offset = 0;
  while (true) {
    const response = await datasetClient.listItems({
      limit: pageSize,
      offset,
      clean,
    });

    const batch = response?.items ?? [];
    if (!batch.length) {
      break;
    }

    items.push(...batch);
    offset += batch.length;

    if (limit !== undefined && items.length >= limit) {
      break;
    }

    const total = response.total ?? response.count ?? response.items?.length;
    if (typeof total === 'number' && offset >= total) {
      break;
    }
  }

  const output = limit !== undefined ? items.slice(0, limit) : items;
  process.stdout.write(JSON.stringify(output));
}

main().catch((error) => {
  const payload = {
    name: error?.name || 'Error',
    message: error?.message || String(error),
  };
  if (error?.stack) {
    payload.stack = error.stack;
  }
  if (error?.statusCode) {
    payload.statusCode = error.statusCode;
  }
  process.stderr.write(JSON.stringify(payload));
  process.exit(1);
});
