const DEVELOPMENT_CONNECTION_STRING = [
    'DefaultEndpointsProtocol=http',
    'AccountName=devstoreaccount1',
    'AccountKey=Eby8vdM02xNOcqFeqCnf2zCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',
    'BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1'
].join(';');

function parseConnectionString(connectionString) {
    return connectionString
        .split(';')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .reduce((parts, segment) => {
            const separatorIndex = segment.indexOf('=');

            if (separatorIndex === -1) {
                return parts;
            }

            const key = segment.slice(0, separatorIndex);
            const value = segment.slice(separatorIndex + 1);

            parts[key] = value;
            return parts;
        }, {});
}

function getBlobEndpoint(parts) {
    if (parts.BlobEndpoint) {
        return parts.BlobEndpoint.replace(/\/+$/, '');
    }

    if (!parts.DefaultEndpointsProtocol || !parts.AccountName || !parts.EndpointSuffix) {
        throw new Error('AzureWebJobsStorage is missing BlobEndpoint details.');
    }

    return `${parts.DefaultEndpointsProtocol}://${parts.AccountName}.blob.${parts.EndpointSuffix}`;
}

function extractConnectionStringParts(connectionString) {
    if (!connectionString) {
        throw new Error('AzureWebJobsStorage is not configured.');
    }

    const resolvedConnectionString = connectionString.startsWith('UseDevelopmentStorage=true')
        ? DEVELOPMENT_CONNECTION_STRING
        : connectionString;

    const parts = parseConnectionString(resolvedConnectionString);
    const accountName = parts.AccountName;
    const accountKey = parts.AccountKey;
    const blobEndpoint = getBlobEndpoint(parts);

    if (!accountName || !accountKey) {
        throw new Error('AzureWebJobsStorage must contain AccountName and AccountKey.');
    }

    return {
        accountName,
        accountKey: Buffer.from(accountKey, 'base64'),
        url: blobEndpoint
    };
}

module.exports = {
    extractConnectionStringParts
};