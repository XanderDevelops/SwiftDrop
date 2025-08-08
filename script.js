// --- Third-party library for large file saving ---
const streamSaver = window.streamSaver;

// --- UI Element Map ---
const views = {
    initial: document.getElementById('initial-view'),
    offer: document.getElementById('offer-view'),
    answer: document.getElementById('answer-view'),
    progress: document.getElementById('progress-view'),
    sendComplete: document.getElementById('send-complete-view'),
    receiveComplete: document.getElementById('receive-complete-view')
};

// --- All Interactive Elements ---
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const selectedFileName = document.getElementById('selected-file-name');
const createOfferButton = document.getElementById('create-offer-button');
const offerTextarea = document.getElementById('offer-textarea');
const acceptOfferButton = document.getElementById('accept-offer-button');
const answerTextarea = document.getElementById('answer-textarea');
const acceptAnswerButton = document.getElementById('accept-answer-button');
const startAgainButton = document.getElementById('start-again-button');
const offerInstructions = document.getElementById('offer-instructions');
const answerInstructions = document.getElementById('answer-instructions');
const statusDiv = document.getElementById('status');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const receivedFileName = document.getElementById('file-name');
const sendAnotherButton = document.getElementById('send-another-button');
const receiveAnotherButton = document.getElementById('receive-another-button');

// --- State Variables ---
let peerConnection;
let dataChannel;
let selectedFile;
let fileInfo = {};

// --- WebRTC & Performance Constants ---
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};
const CHUNK_SIZE = 262144; // 256KB
const BUFFER_HIGH_THRESHOLD = 1024 * 1024 * 10; // 10MB

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
    fileInfo = {};
    fileInput.value = '';
    selectedFileName.textContent = '';
    createOfferButton.disabled = true;
    offerTextarea.value = '';
    answerTextarea.value = '';
    showView('initial');
}

// --- Manual Handshake Logic ---

// SENDER: Step 1 - User selects a file, then clicks "Create Offer"
createOfferButton.addEventListener('click', async () => {
    peerConnection = new RTCPeerConnection(configuration);
    
    // Senders create the data channel
    dataChannel = peerConnection.createDataChannel('fileTransfer', { ordered: true });
    setupDataChannel(); // Setup data channel handlers
    
    // Listen for ICE candidates and collect them
    let candidates = [];
    peerConnection.onicecandidate = e => {
        if (e.candidate) {
            candidates.push(e.candidate);
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Wait a moment for ICE candidates to gather
    setTimeout(() => {
        const offerPayload = {
            sdp: peerConnection.localDescription,
            candidates: candidates
        };
        offerTextarea.value = JSON.stringify(offerPayload);
        offerInstructions.textContent = "1. Copy this code. 2. Paste it on the other device.";
        offerTextarea.readOnly = true;
        acceptOfferButton.style.display = 'none'; // Hide irrelevant button
        answerTextarea.value = ''; // Clear answer area for pasting
        showView('answer'); // Show view with both offer and answer fields
        answerInstructions.textContent = "3. Paste the final code from the other device here.";
    }, 500);
});

// RECEIVER: Step 2 - User pastes offer code and clicks "Accept Offer"
function startReceiverFlow() {
    peerConnection = new RTCPeerConnection(configuration);

    // Receivers listen for the data channel to be created by the sender
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel();
    };

    let candidates = [];
    peerConnection.onicecandidate = e => {
        if (e.candidate) {
            candidates.push(e.candidate);
        }
    };
    
    // Process the pasted offer
    const offerPayload = JSON.parse(offerTextarea.value);
    peerConnection.setRemoteDescription(offerPayload.sdp);
    offerPayload.candidates.forEach(c => peerConnection.addIceCandidate(c));

    peerConnection.createAnswer().then(answer => {
        peerConnection.setLocalDescription(answer);

        setTimeout(() => {
            const answerPayload = {
                sdp: peerConnection.localDescription,
                candidates: candidates
            };
            answerTextarea.value = JSON.stringify(answerPayload);
            offerTextarea.readOnly = true;
            answerTextarea.readOnly = true;
            acceptAnswerButton.style.display = 'none';
            offerInstructions.textContent = "Offer code has been accepted.";
            answerInstructions.textContent = "Copy this code and paste it back on the sending device.";
            showView('answer');
        }, 500);
    });
}

// SENDER: Step 3 - User pastes the final answer and clicks "Connect"
acceptAnswerButton.addEventListener('click', async () => {
    const answerPayload = JSON.parse(answerTextarea.value);
    await peerConnection.setRemoteDescription(answerPayload.sdp);
    answerPayload.candidates.forEach(c => peerConnection.addIceCandidate(c));
    // The connection will now establish, and the 'onopen' event on the data channel will fire.
});


// --- Universal File and Data Logic ---

function handleFileSelect(file) {
    if (file) {
        selectedFile = file;
        selectedFileName.textContent = `Selected: ${file.name}`;
        createOfferButton.disabled = false;
    }
}

// This function is for BOTH sender and receiver, setting up what happens on the data channel
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

    dataChannel.onmessage = (event) => {
        const data = event.data;
        if (typeof data === 'string') {
            // First message is file metadata
            fileInfo = JSON.parse(data);
            receivedSize = 0;
            fileStream = streamSaver.createWriteStream(fileInfo.name, { size: fileInfo.size });
            writer = fileStream.getWriter();
            showView('progress');
            statusDiv.textContent = `Receiving: ${fileInfo.name}`;
        } else {
            // It's a file chunk. Write it directly to disk via StreamSaver
            if (writer) {
                writer.write(new Uint8Array(data));
                receivedSize += data.byteLength;
                
                const progress = fileInfo.size ? Math.min((receivedSize / fileInfo.size) * 100, 100) : 0;
                progressBar.style.width = `${progress}%`;
                progressText.textContent = `${Math.round(progress)}%`;

                if (receivedSize === fileInfo.size) {
                    writer.close();
                    statusDiv.textContent = 'File Received!';
                    receivedFileName.textContent = `${fileInfo.name} has been saved to your Downloads folder.`;
                    document.getElementById('download-button').style.display = 'none';
                    showView('receiveComplete');
                }
            }
        }
    };
}

// This function is ONLY for the sender
async function sendFile() {
    statusDiv.textContent = `Sending: ${selectedFile.name}`;
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
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${Math.round(progress)}%`;
    }

    showView('sendComplete');
}


// --- Initial Event Listeners ---

fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('hover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('hover');
    handleFileSelect(e.dataTransfer.files[0]);
});

// This detects when a user pastes an offer code to become a receiver
offerTextarea.addEventListener('paste', () => {
    // Use a short timeout to allow the paste action to complete
    setTimeout(() => {
        try {
            // Check if the pasted content is a valid offer
            const offer = JSON.parse(offerTextarea.value);
            if (offer.sdp && offer.candidates) {
                startReceiverFlow();
            }
        } catch (error) {
            // Not a valid offer, do nothing
        }
    }, 50);
});

startAgainButton.addEventListener('click', resetApp);
sendAnotherButton.addEventListener('click', resetApp);
receiveAnotherButton.addEventListener('click', resetApp);

document.addEventListener('DOMContentLoaded', resetApp);