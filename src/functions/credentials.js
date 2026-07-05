const { app } = require('@azure/functions');
const {
    BlobServiceClient,
    BlobSASPermissions,
    ContainerSASPermissions,
    StorageSharedKeyCredential,
    generateBlobSASQueryParameters
} = require('@azure/storage-blob');
const { extractConnectionStringParts } = require('../util');

const DEFAULT_CONTAINER_NAME = process.env.IMAGE_CONTAINER_NAME || 'images';
const DEFAULT_CONTAINER_NAME_VIDEO = process.env.VIDEO_CONTAINER_NAME || 'videos';
const SAS_DURATION_MINUTES = 15;
const DEFAULT_ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://medaraemarui-hdcgdqcbg0g4cnan.ukwest-01.azurewebsites.net' || '';
// const DEFAULT_ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

app.http('credentials', {
    route: 'api/credentials',
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const corsHeaders = buildCorsHeaders(request.headers.get('origin'));

        if (request.method === 'OPTIONS') {
            return {
                status: 204,
                headers: corsHeaders,
            };
        }

        context.log(`Issuing blob upload SAS for ${request.url}`);

        const connectionString = process.env.AzureWebJobsStorage;
        const containerName = DEFAULT_CONTAINER_NAME;

        await ensureContainerExists(connectionString, containerName);

        const payload = buildUploadCredentials(connectionString, containerName);

        return {
            status: 200,
            jsonBody: payload,
            headers: {
                ...corsHeaders,
                'Cache-Control': 'no-store'
            }
        };
    }
});

function buildCorsHeaders(origin, methods = 'GET, OPTIONS') {
    const allowedOrigin = origin || DEFAULT_ALLOWED_ORIGIN;

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': methods,
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
        'Vary': 'Origin'
    };
}

async function ensureContainerExists(connectionString, containerName) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    await containerClient.createIfNotExists();
}

function buildUploadCredentials(connectionString, containerName) {
    const { accountKey, accountName, url } = extractConnectionStringParts(connectionString);
    const credential = new StorageSharedKeyCredential(accountName, accountKey.toString('base64'));
    const startsOn = new Date(Date.now() - 5 * 60 * 1000);
    const expiresOn = new Date(Date.now() + SAS_DURATION_MINUTES * 60 * 1000);
    const protocol = url.startsWith('http://') ? 'http' : 'https';
    const sasToken = generateBlobSASQueryParameters({
        containerName,
        permissions: ContainerSASPermissions.parse('cw'),
        startsOn,
        expiresOn,
        protocol
    }, credential).toString();

    const containerUrl = `${url}/${containerName}`;

    return {
        accountUrl: url,
        containerName,
        containerUrl,
        sasToken,
        expiresOn: expiresOn.toISOString(),
        maxFileSizeBytes: 5 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    };
}

// ── Read SAS endpoint ────────────────────────────────────────────────────────
// Returns a short-lived, read-only SAS URL for a single blob.
// Content-Disposition: inline ensures the browser streams/renders the file
// rather than triggering a download dialog.
app.http('credentials-read', {
    route: 'api/credentials-read',
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const corsHeaders = buildCorsHeaders(request.headers.get('origin'));

        if (request.method === 'OPTIONS') {
            return { status: 204, headers: corsHeaders };
        }

        const blobPath = request.query.get('blobPath');

        if (!blobPath) {
            return {
                status: 400,
                jsonBody: { error: 'blobPath query parameter is required.' },
                headers: corsHeaders
            };
        }

        // blobPath is the full blob name inside the fixed video container
        // (e.g. "videos/{uuid}/fruits.mp4"), not "<containerName>/<blobName>".
        const containerName = DEFAULT_CONTAINER_NAME;
        const blobName = blobPath;

        context.log(`Issuing read SAS for blob: ${containerName}/${blobName}`);

        const connectionString = process.env.AzureWebJobsStorage;
        const sasUrl = buildReadSasUrl(connectionString, containerName, blobName);

        return {
            status: 200,
            jsonBody: { sasUrl, expiresIn: SAS_DURATION_MINUTES * 60 },
            headers: {
                ...corsHeaders,
                'Cache-Control': 'no-store'
            }
        };
    }
});

function buildReadSasUrl(connectionString, containerName, blobName) {
    const { accountKey, accountName, url } = extractConnectionStringParts(connectionString);
    const credential = new StorageSharedKeyCredential(accountName, accountKey.toString('base64'));
    const startsOn = new Date(Date.now() - 5 * 60 * 1000);
    const expiresOn = new Date(Date.now() + SAS_DURATION_MINUTES * 60 * 1000);
    const protocol = url.startsWith('http://') ? 'http' : 'https';

    const sasToken = generateBlobSASQueryParameters({
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn,
        protocol,
        // inline keeps the browser from offering a download dialog
        contentDisposition: 'inline'
    }, credential).toString();

    return `${url}/${containerName}/${encodeBlobPath(blobName)}?${sasToken}`;
}

function encodeBlobPath(blobName) {
    return blobName.split('/').map(encodeURIComponent).join('/');
}

// ── Delete blob endpoint ─────────────────────────────────────────────────────
// Deletes a single video blob identified by blobPath.
app.http('delete-blob', {
    route: 'api/delete-blob',
    methods: ['DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const corsHeaders = buildCorsHeaders(request.headers.get('origin'), 'DELETE, OPTIONS');

        if (request.method === 'OPTIONS') {
            return { status: 204, headers: corsHeaders };
        }

        const blobPath = request.query.get('blobPath');

        if (!blobPath) {
            return {
                status: 400,
                jsonBody: { error: 'blobPath query parameter is required.' },
                headers: corsHeaders
            };
        }

        const containerName = DEFAULT_CONTAINER_NAME;
        const connectionString = process.env.AzureWebJobsStorage;

        try {
            const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
            const containerClient = blobServiceClient.getContainerClient(containerName);
            const blobClient = containerClient.getBlobClient(blobPath.trim());

            await blobClient.deleteIfExists();

            context.log(`Deleted blob: ${containerName}/${blobPath}`);

            return { status: 204, headers: corsHeaders };
        } catch (error) {
            context.error(`Failed to delete blob ${containerName}/${blobPath}: ${error.message}`);

            return {
                status: 500,
                jsonBody: { error: 'Failed to delete blob' },
                headers: corsHeaders
            };
        }
    }
});
