const streamSaver = window.streamSaver;

// --- UI Element Map ---
const views = {
    roleSelection: document.getElementById('role-selection-view'),
    fileSelection: document.getElementById('file-selection-view'),
    handshake: document.getElementById('handshake-view'),
    progress: document.getElementById('progress-view'),
    sendComplete: document.getElementById('send-complete-view'),
    receiveComplete: document.getElementById('receive-complete-view')
};

// --- All Interactive Elements ---
const startSendButton = document.getElementById('start-send-button');
const startReceiveButton = document.getElementById('start-receive-button');
const backToStartButton = document.getElementById('back-to-start-button');
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const selectedFileName = document.getElementById('selected-file-name');
const senderCodeTextarea = document.getElementById('sender-code-textarea');
const receiverCodeTextarea = document.getElementById('receiver-code-textarea');
const connectButton = document.getElementById('connect-button');
const senderInstructions = document.getElementById('sender-instructions');
const receiverInstructions = document.getElementById('receiver-instructions');
const receiverWaitingMessage = document.getElementById('receiver-waiting-message');

// --- State Variables & Constants ---
let peerConnection;
let dataChannel;
let selectedFile;
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// --- Core UI Management ---
function showView(viewName) {
    for (let key in views) {
        views[key].style.display = 'none';
    }
    views[viewName].style.display = 'block';
}

function resetApp() {
    if (peerConnection) {
        peerConnection.close();
    }
    selectedFile = null;
    fileInput.value = '';
    selectedFileName.textContent = '';
    senderCodeTextarea.value = '';
    receiverCodeTextarea.value = '';
    showView('roleSelection');
}

// --- Event Listeners for Initial Role Selection ---
startSendButton.addEventListener('click', () => showView('fileSelection'));
startReceiveButton.addEventListener('click', startReceiverFlow);
backToStartButton.addEventListener('click', resetApp);


// --- SENDER'S WORKFLOW ---
function handleFileSelect(file) {
    if (file) {
        selectedFile = file;
        selectedFileName.textContent = `Selected: ${file.name}`;
        createOffer(); // Automatically start the process once a file is chosen
    }
}

async function createOffer() {
    peerConnection = new RTCPeerConnection(configuration);
    
    dataChannel = peerConnection.createDataChannel('fileTransfer');
    setupDataChannel(); // Setup handlers for when the connection opens
    
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    peerConnection.onicecandidate = event => {
        if (!event.candidate) {
            // All ICE candidates have been gathered
            const offerPayload = { sdp: peerConnection.localDescription };
            senderCodeTextarea.value = JSON.stringify(offerPayload);
            showView('handshake');
        }
    };
}

// --- RECEIVER'S WORKFLOW ---
function startReceiverFlow() {
    // Configure the UI for receiving
    senderInstructions.querySelector('h3').textContent = "Step 1: Get the Sender Code";
    senderInstructions.querySelector('p').textContent = "Paste the code from the sending device below.";
    senderCodeTextarea.readOnly = false;
    senderCodeTextarea.placeholder = "Paste sender's code here...";
    receiverInstructions.style.display = 'none'; // Hide the receiver part for now
    
    // Add a listener for when the receiver pastes the code
    senderCodeTextarea.addEventListener('input', createAnswer, { once: true });
    showView('handshake');
}

async function createAnswer() {
    peerConnection = new RTCPeerConnection(configuration);
    
    peerConnection.ondatachannel = event => {
        dataChannel = event.channel;
        setupDataChannel();
    };

    try {
        const offerPayload = JSON.parse(senderCodeTextarea.value);
        await peerConnection.setRemoteDescription(offerPayload.sdp);

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        peerConnection.onicecandidate = event => {
            if (!event.candidate) {
                const answerPayload = { sdp: peerConnection.localDescription };
                receiverInstructions.style.display = 'block';
                receiverCodeTextarea.value = JSON.stringify(answerPayload);
                receiverCodeTextarea.readOnly = true;
                connectButton.style.display = 'none'; // No connect button for receiver
                
                // Update instructions
                senderInstructions.querySelector('p').textContent = "Offer accepted. Waiting for sender to connect.";
                senderCodeTextarea.readOnly = true;
                receiverInstructions.querySelector('h3').textContent = "Step 2: Share Your Receiver Code";
                receiverInstructions.querySelector('p').textContent = "Copy the code below and send it back to the sending device.";
            }
        };
    } catch (e) {
        alert("Invalid Sender Code. Please try again.");
        resetApp();
    }
}


// --- FINAL CONNECTION STEP (Executed by Sender) ---
connectButton.addEventListener('click', async () => {
    try {
        const answerPayload = JSON.parse(receiverCodeTextarea.value);
        await peerConnection.setRemoteDescription(answerPayload.sdp);
    } catch (e) {
        alert("Invalid Receiver Code. Please check the code and try again.");
    }
    // If successful, the 'onopen' event of the data channel will fire.
});


// --- DATA TRANSFER LOGIC (Unchanged from large-file version) ---
function setupDataChannel() { /* ... copy from previous answer ... */ }
async function sendFile() { /* ... copy from previous answer ... */ }


// --- Initial Listeners ---
fileInput.addEventListener('change', e => handleFileSelect(e.target.files[0]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('hover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('hover');
    handleFileSelect(e.dataTransfer.files[0]);
});

// Add reset handlers to complete views
document.getElementById('send-another-button')?.addEventListener('click', resetApp);
document.getElementById('receive-another-button')?.addEventListener('click', resetApp);

document.addEventListener('DOMContentLoaded', resetApp);


// --- PASTE THE UNCHANGED FUNCTIONS HERE ---
// You must copy the `setupDataChannel` and `sendFile` functions
// from the previous "large file" version and paste them below.

function setupDataChannel() {
    dataChannel.onopen = () => {
        if (selectedFile) { // Only the sender has a selected file
            showView('progress');
            sendFile();
        }
    };

    let fileStream;
    let writer;
    let receivedSize = 0;
    let fileInfo = {};

    dataChannel.onmessage = (event) => {
        const data = event.data;
        if (typeof data === 'string') {
            fileInfo = JSON.parse(data);
            receivedSize = 0;
            fileStream = streamSaver.createWriteStream(fileInfo.name, { size: fileInfo.size });
            writer = fileStream.getWriter();
            showView('progress');
            document.getElementById('status').textContent = `Receiving: ${fileInfo.name}`;
        } else {
            if (writer) {
                writer.write(new Uint8Array(data));
                receivedSize += data.byteLength;
                
                const progress = fileInfo.size ? Math.min((receivedSize / fileInfo.size) * 100, 100) : 0;
                document.getElementById('progress-bar').style.width = `${progress}%`;
                document.getElementById('progress-text').textContent = `${Math.round(progress)}%`;

                if (receivedSize === fileInfo.size) {
                    writer.close();
                    document.getElementById('status').textContent = 'File Received!';
                    document.getElementById('file-name').textContent = `${fileInfo.name} has been saved to your Downloads folder.`;
                    document.getElementById('download-button').style.display = 'none';
                    showView('receiveComplete');
                }
            }
        }
    };
}

async function sendFile() {
    const CHUNK_SIZE = 262144;
    const BUFFER_HIGH_THRESHOLD = 1024 * 1024 * 10;
    document.getElementById('status').textContent = `Sending: ${selectedFile.name}`;
    const file = selectedFile;
    
    dataChannel.send(JSON.stringify({ name: file.name, size: file.size }));

    let offset = 0;
    
    while (offset < file.size) {
        if (dataChannel.bufferedAmount > BUFFER_HIGH_THRESHOLD) {
            await new Promise(resolve => {
                const checkBuffer = setInterval(() => {
                    if (dataChannel.bufferedAmount <= BUFFER_HIGH_THRESHOLD / 2) {
                        clearInterval(checkBuffer);
                        resolve();
                    }
                }, 100);
            });
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const chunk = await slice.arrayBuffer();
        dataChannel.send(chunk);
        offset += chunk.byteLength;

        const progress = file.size ? Math.min((offset / file.size) * 100, 100) : 0;
        document.getElementById('progress-bar').style.width = `${progress}%`;
        document.getElementById('progress-text').textContent = `${Math.round(progress)}%`;
    }
    showView('sendComplete');
}