# Azure Blob Image Upload

This Function App serves a small browser UI and issues short-lived SAS tokens so images can upload directly to Azure Blob Storage.

## What changed

- `GET /` serves the upload page.
- `GET /upload.js` serves the browser upload logic.
- `GET /api/credentials` creates the `images` container if needed and returns a 15-minute SAS for direct uploads.

## Local run

1. Make sure `AzureWebJobsStorage` points to a real storage account or Azurite in `local.settings.json`.
2. Run `npm install`.
3. Run `func start` or use the VS Code task.
4. Open `http://localhost:7071`.

## Required Azure Storage CORS

Because the browser uploads directly to Blob Storage, the storage account must allow your frontend origin.

For local development, add a Blob CORS rule that allows:

- Origin: `http://localhost:7071`
- Methods: `PUT, OPTIONS`
- Allowed headers: `*`
- Exposed headers: `ETag, x-ms-request-id, x-ms-version`

For deployment, add the production site origin as well.

## Optional settings

- `IMAGE_CONTAINER_NAME`: overrides the default container name `images`.