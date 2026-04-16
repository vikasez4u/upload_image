const { app } = require('@azure/functions');
const {
    BlobServiceClient,
    ContainerSASPermissions,
    StorageSharedKeyCredential,
    generateBlobSASQueryParameters
} = require('@azure/storage-blob');
const { extractConnectionStringParts } = require('../util');

const DEFAULT_CONTAINER_NAME = process.env.IMAGE_CONTAINER_NAME || 'images';
const SAS_DURATION_MINUTES = 15;
const DEFAULT_ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

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

function buildCorsHeaders(origin) {
    const allowedOrigin = origin || DEFAULT_ALLOWED_ORIGIN;

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
