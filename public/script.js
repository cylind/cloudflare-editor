document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connectButton');
    const fileListElement = document.getElementById('fileList');
    const fileNameInput = document.getElementById('fileNameInput');
    const saveLocalButton = document.getElementById('saveLocalButton');
    const saveCloudButton = document.getElementById('saveCloudButton');
    const renameCloudButton = document.getElementById('renameCloudButton');
    const deleteCloudButton = document.getElementById('deleteCloudButton');
    const editorContainer = document.getElementById('editorContainer');

    const passwordModal = document.getElementById('passwordModal');
    const apiTokenInput = document.getElementById('apiTokenInput');
    const submitTokenButton = document.getElementById('submitTokenButton');
    const closeModalButton = document.querySelector('.modal .close-button');
    const modalErrorElement = document.getElementById('modalError');

    let editor;
    let apiToken = null;
    let currentCloudFile = null; // Tracks the name of the file loaded from cloud
    let isConnected = false;

    // Initialize Monaco Editor
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.48.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        editor = monaco.editor.create(editorContainer, {
            value: '# Welcome to Cloudflare Editor!\n# Connect to cloud to load/save files from R2.',
            language: 'yaml', // Default language, can be dynamic
            theme: 'vs-dark', // or 'vs-light'
            automaticLayout: true,
        });

        editor.onDidChangeModelContent(() => {
            if (isConnected && currentCloudFile) {
                saveCloudButton.disabled = false;
            }
        });
    });

    function updateButtonStates() {
        const hasSelection = currentCloudFile !== null;
        saveCloudButton.disabled = !isConnected || !editor.getValue(); // Disable if no content or not connected
        renameCloudButton.disabled = !isConnected || !hasSelection;
        deleteCloudButton.disabled = !isConnected || !hasSelection;

        if (isConnected) {
            connectButton.classList.add('connected');
            connectButton.classList.remove('error');
            connectButton.textContent = '☁️ Connected';
        } else {
            connectButton.classList.remove('connected');
            connectButton.textContent = '☁️ Connect to Cloud';
        }
    }

    // --- Modal Logic ---
    connectButton.addEventListener('click', () => {
        if (isConnected) {
            // Optional: Implement disconnect logic if needed
            // For now, clicking when connected does nothing or re-prompts
            apiToken = null;
            isConnected = false;
            currentCloudFile = null;
            fileListElement.innerHTML = '<li>Connect to load files.</li>';
            fileNameInput.value = '';
            editor.setValue('# Disconnected from Cloud.');
            updateButtonStates();
            passwordModal.style.display = 'block';
            modalErrorElement.textContent = '';
        } else {
            passwordModal.style.display = 'block';
            modalErrorElement.textContent = '';
            apiTokenInput.focus();
        }
    });

    closeModalButton.addEventListener('click', ()_blank => {
        passwordModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === passwordModal) {
            passwordModal.style.display = 'none';
        }
    });

    submitTokenButton.addEventListener('click', async () => {
        const token = apiTokenInput.value.trim();
        if (!token) {
            modalErrorElement.textContent = 'API Token cannot be empty.';
            return;
        }
        modalErrorElement.textContent = 'Connecting...';
        // Attempt to list files to verify token
        try {
            const response = await fetch('/api/files', {
                headers: { 'X-API-TOKEN': token }
            });
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    throw new Error('Invalid or incorrect API Token.');
                }
                throw new Error(`Connection failed: ${response.statusText}`);
            }
            apiToken = token;
            isConnected = true;
            passwordModal.style.display = 'none';
            apiTokenInput.value = ''; // Clear after use
            updateButtonStates();
            await loadFileList();
            editor.setValue("# Successfully connected to R2. Select a file or create a new one.");
        } catch (error) {
            console.error('Connection error:', error);
            modalErrorElement.textContent = error.message;
            apiToken = null;
            isConnected = false;
            updateButtonStates();
            connectButton.classList.add('error');
            connectButton.textContent = '☁️ Connection Failed';
        }
    });

    // --- File Operations ---
    async function loadFileList() {
        if (!isConnected || !apiToken) return;
        fileListElement.innerHTML = '<li>Loading...</li>';
        try {
            const response = await fetch('/api/files', {
                headers: { 'X-API-TOKEN': apiToken }
            });
            if (!response.ok) throw new Error(`Failed to fetch files: ${response.status}`);
            const files = await response.json();
            fileListElement.innerHTML = '';
            if (files.length === 0) {
                fileListElement.innerHTML = '<li>No files in bucket.</li>';
            } else {
                files.forEach(file => {
                    const li = document.createElement('li');
                    li.textContent = file.key;
                    li.dataset.fileName = file.key;
                    li.addEventListener('click', () => loadFileFromCloud(file.key));
                    fileListElement.appendChild(li);
                });
            }
        } catch (error) {
            console.error('Error loading file list:', error);
            fileListElement.innerHTML = `<li>Error: ${error.message}</li>`;
            alert(`Error loading file list: ${error.message}`);
        }
    }

    async function loadFileFromCloud(fileName) {
        if (!isConnected || !apiToken) {
            alert('Not connected to cloud.');
            return;
        }
        try {
            const response = await fetch(`/api/files/${encodeURIComponent(fileName)}`, {
                headers: { 'X-API-TOKEN': apiToken }
            });
            if (!response.ok) throw new Error(`Failed to load file: ${response.status}`);
            const content = await response.text();
            editor.setValue(content);
            fileNameInput.value = fileName;
            currentCloudFile = fileName; // Set current cloud file

            // Update selected item in list
            document.querySelectorAll('#fileList li').forEach(li => {
                li.classList.toggle('selected', li.dataset.fileName === fileName);
            });

            // Try to guess language from extension
            const extension = fileName.split('.').pop().toLowerCase();
            let language = 'plaintext';
            if (extension === 'yaml' || extension === 'yml') language = 'yaml';
            else if (extension === 'json') language = 'json';
            else if (extension === 'js') language = 'javascript';
            else if (extension === 'ts') language = 'typescript';
            else if (extension === 'py') language = 'python';
            else if (extension === 'html') language = 'html';
            else if (extension === 'css') language = 'css';
            else if (extension === 'md') language = 'markdown';

            monaco.editor.setModelLanguage(editor.getModel(), language);
            saveCloudButton.disabled = true; // Content is fresh from cloud
            updateButtonStates();

        } catch (error) {
            console.error('Error loading file:', error);
            alert(`Error loading file ${fileName}: ${error.message}`);
            currentCloudFile = null;
            updateButtonStates();
        }
    }

    saveLocalButton.addEventListener('click', () => {
        const content = editor.getValue();
        const fName = fileNameInput.value || 'untitled.txt';
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fName;
        link.click();
        URL.revokeObjectURL(link.href);
    });

    saveCloudButton.addEventListener('click', async () => {
        if (!isConnected || !apiToken) {
            alert('Not connected to cloud. Cannot save.');
            return;
        }
        let fName = fileNameInput.value.trim();
        if (!fName) {
            fName = prompt("Please enter a file name (e.g., config.yaml):");
            if (!fName) return; // User cancelled
            fileNameInput.value = fName; // Update input if new name given
        }

        const content = editor.getValue();
        try {
            const response = await fetch(`/api/files/${encodeURIComponent(fName)}`, {
                method: 'PUT',
                headers: {
                    'X-API-TOKEN': apiToken,
                    'Content-Type': 'application/octet-stream' // Or appropriate based on file
                },
                body: content
            });
            if (!response.ok) throw new Error(`Failed to save: ${response.status} ${await response.text()}`);
            alert(`File "${fName}" saved to cloud successfully!`);
            currentCloudFile = fName; // Update current cloud file if it was a new save
            saveCloudButton.disabled = true; // Content matches cloud
            await loadFileList(); // Refresh file list
             // Highlight the saved file
            document.querySelectorAll('#fileList li').forEach(li => {
                li.classList.toggle('selected', li.dataset.fileName === fName);
            });
        } catch (error) {
            console.error('Error saving to cloud:', error);
            alert(`Error saving file: ${error.message}`);
        }
    });

    deleteCloudButton.addEventListener('click', async () => {
        if (!isConnected || !apiToken || !currentCloudFile) {
            alert('No file selected or not connected.');
            return;
        }
        if (!confirm(`Are you sure you want to delete "${currentCloudFile}" from the cloud?`)) {
            return;
        }
        try {
            const response = await fetch(`/api/files/${encodeURIComponent(currentCloudFile)}`, {
                method: 'DELETE',
                headers: { 'X-API-TOKEN': apiToken }
            });
            if (!response.ok) throw new Error(`Failed to delete: ${response.status} ${await response.text()}`);
            alert(`File "${currentCloudFile}" deleted from cloud.`);
            editor.setValue('');
            fileNameInput.value = '';
            currentCloudFile = null;
            await loadFileList();
            updateButtonStates();
        } catch (error) {
            console.error('Error deleting from cloud:', error);
            alert(`Error deleting file: ${error.message}`);
        }
    });

    renameCloudButton.addEventListener('click', async () => {
        if (!isConnected || !apiToken || !currentCloudFile) {
            alert('No file selected or not connected.');
            return;
        }
        const newFileName = prompt(`Enter new name for "${currentCloudFile}":`, currentCloudFile);
        if (!newFileName || newFileName === currentCloudFile) {
            return; // User cancelled or no change
        }

        try {
            const response = await fetch(`/api/files/rename`, {
                method: 'POST',
                headers: {
                    'X-API-TOKEN': apiToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ oldKey: currentCloudFile, newKey: newFileName })
            });
            if (!response.ok) throw new Error(`Failed to rename: ${response.status} ${await response.text()}`);
            alert(`File "${currentCloudFile}" renamed to "${newFileName}".`);
            fileNameInput.value = newFileName;
            const oldSelectedFile = currentCloudFile;
            currentCloudFile = newFileName;
            await loadFileList(); // Refresh list
            // Re-select the (renamed) file
            document.querySelectorAll('#fileList li').forEach(li => {
                li.classList.toggle('selected', li.dataset.fileName === newFileName);
            });
            updateButtonStates();

        } catch (error) {
            console.error('Error renaming cloud file:', error);
            alert(`Error renaming file: ${error.message}`);
        }
    });


    // Initial state update
    updateButtonStates();
    fileListElement.innerHTML = '<li>Connect to Cloud to see files.</li>';

    // Handle direct URL download link generation (example)
    // You could add a button "Get Download Link" if needed
    // For actual direct download via URL, the Worker handles it.
});