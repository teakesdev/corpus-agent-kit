# Deploying to Alibaba Cloud Function Compute

1. `npm i -g @serverless-devs/s`
2. `s config add` → provider alibaba, paste AccessKeyID/Secret (create a RAM user
   with AliyunFCFullAccess; never commit keys).
3. From `autopilot/`: `npm run build`, ensure `node_modules` includes prod deps
   (`npm i --omit=dev` into the packaged dir if size matters).
4. `set -a && source ../.env && set +a && s deploy -t deploy/alibaba/s.yaml`
5. `s info -t deploy/alibaba/s.yaml` → note the HTTPS trigger URL.
6. Smoke: `curl <url>/healthz` → `ok`; open `<url>/` and run one intake turn.
