const streamSaver = window.streamSaver;
const socket = io();

// --- UI Element Map ---
const views = {
    initial: document.getElementById('initial-view'),
    progress: document.getElementById('progress-view'),
    sendComplete: document.getElementById('send-complete-view'),
    receiveComplete: document.getElementById('receive-complete-view')
};

// --- All Interactive Elements ---
const fileInput = document.getElementById('file-input');
const sendButton = document.getElementById('send-button');
const dropZone = document.getElementById('drop-zone');
const selectedFileName = document.getElementById('selected-file-name');
const statusDiv = document.getElementById('status');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const downloadButton = document.getElementById('download-button');
const receivedFileName = document.getElementById('file-name');
const sendAnotherButton = document.getElementById('send-another-button');
const receiveAnotherButton = document.getElementById('receive-another-button');

// --- State Variables ---
let peerConnection;
let dataChannel;
let selectedFile;
let receivedSize = 0;
let fileInfo = {};

// --- WebRTC Configuration ---
// --- WebRTC & Performance Constants ---
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};
const CHUNK_SIZE = 262144; // 256KB chunk size for better performance
const BUFFER_HIGH_THRESHOLD = 1024 * 1024 * 10; // Pause sending if buffer reaches 10MB

// --- Core Functions ---

// Manages which view is visible
function showView(viewName) {
    for (let key in views) {
        views[key].style.display = 'none';
    }
    views[viewName].style.display = 'block';
}

// Resets the entire state to the initial screen
function resetToInitialView() {
    if (peerConnection) {
        peerConnection.close();
    }
    // Clean up state variables
    selectedFile = null;
    receivedSize = 0;
    fileInfo = {};
    fileInput.value = '';
    selectedFileName.textContent = '';
    sendButton.disabled = true;

    initializePeerConnection(); // Re-initialize to be ready for next transfer
    showView('initial');
}

// Sets up the peer connection and all its listeners
function initializePeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // This is the "always-on" listener for incoming files
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel();
        showView('progress'); // A file is coming, switch to progress view
    };

    // Standard WebRTC signaling handlers
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) socket.emit('candidate', event.candidate);
    };
    socket.on('offer', async (offer) => {
        if (peerConnection.signalingState !== 'stable') return;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
    });
    socket.on('answer', async (answer) => {
        if (peerConnection.signalingState !== 'have-local-offer') return;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });
    socket.on('candidate', async (candidate) => {
        if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });
}

// --- DATA CHANNEL LOGIC (Completely Revamped) ---
function setupDataChannel() {
    dataChannel.onopen = () => {
        if (selectedFile) { // Sender's side
            sendFile();
        }
    };

    // RECEIVER'S LOGIC
    let fileStream;
    let writer;
    let receivedSize = 0;

    dataChannel.onmessage = (event) => {
        const data = event.data;
        if (typeof data === 'string') {
            // First message is file metadata. Initialize the download stream.
            fileInfo = JSON.parse(data);
            receivedSize = 0;
            
            // Start the StreamSaver stream
            fileStream = streamSaver.createWriteStream(fileInfo.name, {
                size: fileInfo.size
            });
            writer = fileStream.getWriter();

            statusDiv.textContent = `Receiving: ${fileInfo.name}`;
            // Hide the old download view and just show progress
            views.receiveComplete.style.display = 'none';

        } else {
            // It's a file chunk. Write it directly to the disk.
            if (writer) {
                writer.write(new Uint8Array(data));
                receivedSize += data.byteLength;
                
                const progress = fileInfo.size ? Math.min((receivedSize / fileInfo.size) * 100, 100) : 0;
                progressBar.style.width = `${progress}%`;
                progressText.textContent = `${Math.round(progress)}%`;

                // When the file is fully received
                if (receivedSize === fileInfo.size) {
                    writer.close();
                    statusDiv.textContent = 'File Received!';
                    // Show a simplified completion view
                    receivedFileName.textContent = `${fileInfo.name} has been saved to your Downloads folder.`;
                    downloadButton.style.display = 'none'; // Hide the old button
                    showView('receiveComplete');
                }
            }
        }
    };
}

// SENDER'S LOGIC (With Backpressure Handling)
async function sendFile() {
    statusDiv.textContent = `Sending: ${selectedFile.name}`;
    const file = selectedFile;
    
    // 1. Send metadata first
    dataChannel.send(JSON.stringify({ name: file.name, size: file.size, type: file.type }));

    let offset = 0;
    
    // 2. Read and send file in chunks
    while (offset < file.size) {
        // Check for backpressure. If the buffer is full, wait.
        if (dataChannel.bufferedAmount > BUFFER_HIGH_THRESHOLD) {
            // Wait until the buffer is drained
            await new Promise(resolve => {
                const checkBuffer = setInterval(() => {
                    if (dataChannel.bufferedAmount <= BUFFER_HIGH_THRESHOLD / 2) {
                        clearInterval(checkBuffer);
                        resolve();
                    }
                }, 100); // Check every 100ms
            });
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const chunk = await slice.arrayBuffer();
        dataChannel.send(chunk);
        offset += chunk.byteLength;

        const progress = file.size ? Math.min((offset / file.size) * 100, 100) : 0;
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${Math.round(progress)}%`;
    }

    // 3. Show completion view
    showView('sendComplete');
}

// --- Event Listeners and Initial Load ---
// File selection (input or drag/drop)
function handleFileSelect(file) {
    if (file) {
        selectedFile = file;
        selectedFileName.textContent = `Selected: ${file.name}`;
        sendButton.disabled = false;
    }
}
fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('hover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('hover');
    handleFileSelect(e.dataTransfer.files[0]);
});

// Main "Send" button
sendButton.addEventListener('click', async () => {
    if (selectedFile) {
        dataChannel = peerConnection.createDataChannel('fileTransfer');
        setupDataChannel();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer);
        showView('progress');
        statusDiv.textContent = 'Connecting to peer...';
    }
});

// "Reset" buttons
sendAnotherButton.addEventListener('click', resetToInitialView);
receiveAnotherButton.addEventListener('click', resetToInitialView);

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    initializePeerConnection(); // Make the app "Always-On"
    showView('initial');
});

// Helper functions (also copy from previous script)
function showView(viewName) {
    for (let key in views) {
        views[key].style.display = 'none';
    }
    views[viewName].style.display = 'block';
}

function resetToInitialView() {
    if (peerConnection) {
        peerConnection.close();
    }
    selectedFile = null;
    fileInfo = {};
    fileInput.value = '';
    selectedFileName.textContent = '';
    sendButton.disabled = true;

    initializePeerConnection();
    showView('initial');
}

function initializePeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel();
        showView('progress');
    };
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) socket.emit('candidate', event.candidate);
    };
    socket.on('offer', async (offer) => {
        if (peerConnection.signalingState !== 'stable') return;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
    });
    socket.on('answer', async (answer) => {
        if (peerConnection.signalingState !== 'have-local-offer') return;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });
    socket.on('candidate', async (candidate) => {
        if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });
}