# Deploying to Alibaba Cloud Function Compute

1. `npm i -g @serverless-devs/s`
2. `s config add` → provider alibaba, paste AccessKeyID/Secret (create a RAM user
   with AliyunFCFullAccess; never commit keys).
3. From `autopilot/`: `npm run build`, then stage prod deps INTO `autopilot/`:
   `npm install --omit=dev --no-workspaces`. (This repo is an npm workspace —
   a plain root `npm install` hoists `openai` to the root `node_modules`, and
   `s deploy` packages `autopilot/` alone, so the function would crash on
   ERR_MODULE_NOT_FOUND.)
4. `set -a && source ../.env && set +a && s deploy -t deploy/alibaba/s.yaml`
5. `s info -t deploy/alibaba/s.yaml` → note the HTTPS trigger URL.
6. Smoke: `curl <url>/healthz` → `ok`; POST one intake turn to `<url>/api/chat`.
   NOTE: opening `<url>/` in a browser DOWNLOADS the page — FC's default
   fcapp.run domain injects `Content-Disposition: attachment` on text/html
   (anti-phishing). Host the UI off-origin (the API sends CORS `*`), or bind
   a custom domain to the function to serve the page directly.
