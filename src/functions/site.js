const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { app } = require('@azure/functions');

const staticFiles = {
    '': { fileName: 'index.html', contentType: 'text/html; charset=utf-8' },
    'index.html': { fileName: 'index.html', contentType: 'text/html; charset=utf-8' },
    'upload.js': { fileName: 'upload.js', contentType: 'application/javascript; charset=utf-8' }
};

app.http('site', {
    route: '{*path}',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request) => {
        const requestedPath = normalizePath(request.params.path || '');
        const asset = staticFiles[requestedPath];

        if (!asset) {
            return {
                status: 404,
                body: 'Not found'
            };
        }

        const filePath = path.join(__dirname, '..', asset.fileName);
        const body = await readFile(filePath);

        return {
            status: 200,
            body,
            headers: {
                'Content-Type': asset.contentType,
                'Cache-Control': requestedPath === 'upload.js' ? 'public, max-age=300' : 'no-store'
            }
        };
    }
});

function normalizePath(value) {
    return value.replace(/^\/+|\/+$/g, '');
}