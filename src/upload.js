const form = document.getElementById('upload-form');
const fileInput = document.getElementById('image');
const uploadButton = document.getElementById('upload-button');
const statusElement = document.getElementById('status');
const detailsElement = document.getElementById('details');
const blobUrlElement = document.getElementById('blob-url');
const previewImage = document.getElementById('preview-image');
const progressElement = document.getElementById('progress');

fileInput.addEventListener('change', () => {
    const [file] = fileInput.files;

    if (!file) {
        previewImage.removeAttribute('src');
        setStatus('Waiting for a file.', 'idle');
        detailsElement.textContent = 'No upload started yet.';
        return;
    }

    previewImage.src = URL.createObjectURL(file);
    setStatus(`Ready to upload ${file.name}.`, 'idle');
    detailsElement.textContent = `${file.type || 'application/octet-stream'} - ${formatBytes(file.size)}`;
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const [file] = fileInput.files;

    if (!file) {
        setStatus('Choose an image before uploading.', 'error');
        return;
    }

    toggleUploading(true);
    setStatus('Requesting upload credentials...', 'idle');
    blobUrlElement.textContent = 'Uploading...';
    progressElement.hidden = false;
    progressElement.value = 5;

    try {
        const credentials = await getUploadCredentials();
        validateFile(file, credentials);

        const blobName = buildBlobName(file.name);
        const blobUrl = `${credentials.containerUrl}/${encodeURIComponent(blobName)}?${credentials.sasToken}`;

        setStatus('Uploading image to Azure Blob Storage...', 'idle');

        await uploadBlob(blobUrl, file, (percent) => {
            progressElement.value = percent;
        });

        progressElement.value = 100;

        const cleanBlobUrl = `${credentials.containerUrl}/${encodeURIComponent(blobName)}`;
        setStatus('Upload complete.', 'success');
        detailsElement.textContent = `Container: ${credentials.containerName} | Expires: ${new Date(credentials.expiresOn).toLocaleString()}`;
        blobUrlElement.innerHTML = `<a href="${cleanBlobUrl}" target="_blank" rel="noreferrer">${cleanBlobUrl}</a>`;
        previewImage.src = cleanBlobUrl;
    } catch (error) {
        progressElement.hidden = true;
        progressElement.value = 0;
        setStatus(error.message || 'Upload failed.', 'error');
        detailsElement.textContent = 'Check the Function host logs if the problem persists.';
        blobUrlElement.textContent = 'Upload failed.';
    } finally {
        toggleUploading(false);
    }
});

async function getUploadCredentials() {
    const response = await fetch('/api/credentials', {
        headers: {
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to get upload credentials from the Azure Function.');
    }

    return response.json();
}

function validateFile(file, credentials) {
    if (file.size > credentials.maxFileSizeBytes) {
        throw new Error(`File is too large. Limit is ${formatBytes(credentials.maxFileSizeBytes)}.`);
    }

    if (!credentials.allowedTypes.includes(file.type)) {
        throw new Error(`Unsupported file type: ${file.type || 'unknown'}.`);
    }
}

function buildBlobName(fileName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = fileName.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');

    return `${timestamp}-${safeName}`;
}

function uploadBlob(blobUrl, file, onProgress) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();

        request.open('PUT', blobUrl, true);
        request.setRequestHeader('x-ms-blob-type', 'BlockBlob');
        request.setRequestHeader('x-ms-version', '2023-11-03');
        request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        request.upload.addEventListener('progress', (event) => {
            if (!event.lengthComputable) {
                return;
            }

            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
        });

        request.addEventListener('load', () => {
            if (request.status >= 200 && request.status < 300) {
                resolve();
                return;
            }

            reject(new Error(`Azure Blob Storage rejected the upload with status ${request.status}.`));
        });

        request.addEventListener('error', () => {
            reject(new Error('Network error while uploading to Azure Blob Storage.'));
        });

        request.send(file);
    });
}

function toggleUploading(isUploading) {
    uploadButton.disabled = isUploading;
    fileInput.disabled = isUploading;

    if (!isUploading && progressElement.value === 0) {
        progressElement.hidden = true;
    }
}

function setStatus(message, state) {
    statusElement.textContent = message;
    statusElement.dataset.state = state;
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}