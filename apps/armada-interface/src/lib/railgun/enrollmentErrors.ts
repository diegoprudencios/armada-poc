// ABOUTME: User-facing error messages for enrollment / unlock paths (Sign step, backup restore).

const DEPLOYMENT_SETUP_MSG =
  'Deployment manifests are missing. From the armada-poc repo root run `npm run setup` (local Anvil) ' +
  'or set `VITE_NETWORK=sepolia` in apps/armada-interface/.env.development and restart the dev server.'

const ARTIFACT_DOWNLOAD_MSG =
  'The privacy engine could not download its ZK circuit files (loaded from IPFS when the app starts). ' +
  'This is unrelated to the fee UI. Try disabling ad blockers/VPN for this site, use a stable connection, reload the page, then click Sign again. ' +
  'If it still fails, wait a minute and retry — the IPFS gateway may be rate-limiting.'

const RELAYER_MSG =
  'The fee relayer is not reachable. Start it from armada-poc (`npm run relayer` or your team\'s relayer script) ' +
  'or set `VITE_RELAYER_URL` to a running instance.'

/**
 * Turn low-level failures (JSON.parse SyntaxError, fetch 404 manifests, connection refused)
 * into actionable copy for the Sign enrollment step and backup unlock flows.
 */
export function normalizeEnrollmentError(err: unknown): Error {
  if (!(err instanceof Error)) {
    return new Error('Enrollment failed. Check the browser console for details.')
  }

  const msg = err.message

  if (err instanceof SyntaxError || /Unexpected token/i.test(msg)) {
    return new Error(ARTIFACT_DOWNLOAD_MSG)
  }

  if (/Deployment manifest not found/i.test(msg) || /privacy-pool-hub/i.test(msg)) {
    return new Error(`${DEPLOYMENT_SETUP_MSG} (${msg})`)
  }

  if (/hub deployment is missing contracts\.privacyPool/i.test(msg)) {
    return new Error(DEPLOYMENT_SETUP_MSG)
  }

  if (
    /no PrivacyPool code at/i.test(msg) ||
    /Run `npm run chains`/i.test(msg)
  ) {
    return new Error(
      `${msg} Start local chains with \`npm run chains\` from armada-poc, then \`npm run setup\`, or use Sepolia mode.`,
    )
  }

  if (/ECONNREFUSED|Failed to fetch|connection refused|ERR_CONNECTION_REFUSED/i.test(msg)) {
    if (/3001|relayer|fees/i.test(msg)) {
      return new Error(RELAYER_MSG)
    }
  }

  return err
}
