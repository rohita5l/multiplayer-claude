export const env = {
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  demoRepo: () => process.env.DEMO_REPO_URL ?? "https://github.com/vercel/shop",
  snapshotId: () => process.env.SANDBOX_SNAPSHOT_ID,
};
