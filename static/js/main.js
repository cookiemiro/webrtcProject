console.log('In main.js');

let mapPeers = {};

let usernameInput = document.querySelector('#username');
let btnJoin = document.querySelector('#btn-join');

let username;
let peerUsername;
let webSocket;

// 소켓에서 받은 메시지
function webSocketOnMessage(event) {
    console.log(event);
    let parsedData = JSON.parse(event.data);
    peerUsername = parsedData['peer'];
    let action = parsedData['action'];

    if (username === peerUsername) {
        return;
    }

    let receiver_channel_name = parsedData['message']['receiver_channel_name']

    // new peer joins the room > call offerer function
    if (action === 'new-peer') {
        createOfferer(peerUsername, receiver_channel_name);

        return;
    }

    if (action === 'new-offer') {
        let offer = parsedData['message']['sdp'];

        createAnswerer(offer, peerUsername, receiver_channel_name);

        return;
    }

    if (action === 'new-answer') {
        // offerer의 remote description
        let answer = parsedData['message']['sdp'];

        let peer = mapPeers[peerUsername][0];

        peer.setRemoteDescription(answer);

        return;
    }
}

// 소켓 연결
btnJoin.addEventListener('click', () => {
    username = usernameInput.value;
    console.log(username)

    if (username === '') {
        console.log('username is empty!')
        return;
    }

    usernameInput.value = '';
    usernameInput.disabled = true;
    usernameInput.style.visibility = 'hidden';

    btnJoin.disabled = true;
    btnJoin.style.visibility = 'hidden';

    let labelUsername = document.querySelector('#label-username');
    labelUsername.innerHTML = username;

    let loc = window.location;
    console.log(loc);

    let wsStart = 'ws://';

    if (loc.protocol === 'https:') {
        wsStart = 'wss://';
    }

    let endPoint = wsStart + loc.host + loc.pathname;
    console.log(endPoint);

    webSocket = new WebSocket(endPoint);
    console.log(webSocket);

    webSocket.addEventListener('open', (e) => {
        console.log('Connecttion Opened!');

        sendSignal('new-peer', {});
    });
    webSocket.addEventListener('message', webSocketOnMessage);
    webSocket.addEventListener('close', (e) => {
        console.log('Connecttion Closed!');
    });
    webSocket.addEventListener('error', (e) => {
        console.log('Error Occurred!', e);
    });
});

// 인스턴스를 하나 생성해놓고 미디어 디바이스를 찾아서 값을 할당한다.
let localStream = new MediaStream();
console.log(localStream);

const constraints = {
    'video': true,
    'audio': false
};

const localVideo = document.querySelector('#local-video');
// console.log(localVideo);

const btnToggleAudio = document.querySelector('#btn-toggle-audio');
const btnToggleVideo = document.querySelector('#btn-toggle-video');

let userMedia = navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
        console.log(stream);
        localStream = stream;
        console.log(localStream);
        localVideo.srcObject = localStream;
        localVideo.muted = true;

        // let audioTracks = stream.getAudioTracks();
        let videoTracks = stream.getVideoTracks();
        console.log(videoTracks);
        // console.log(audioTracks);

        // audioTracks[0].muted = false;
        videoTracks[0].muted = true;

        // btnToggleAudio.addEventListener('click', () => {
        //     console.log('aa');
        //     audioTracks[0].enabled = !audioTracks[0].enabled;

        //     if (audioTracks[0].enabled) {
        //         btnToggleAudio.innerHTML = 'Audio Mute';

        //         return;
        //     }

        //     btnToggleAudio.innerHTML = 'Audio Unmute';
        // })

        btnToggleVideo.addEventListener('click', () => {
            console.log('bb');
            videoTracks[0].enabled = !videoTracks[0].enabled;

            if (videoTracks[0].enabled) {
                btnToggleVideo.innerHTML = 'Video Off';

                return;
            }

            btnToggleVideo.innerHTML = 'Video On';
        })
    })
    .catch(error => {
        console.log('Error accessing media devices.', error);
    })
console.log(userMedia);

let btnSendMsg = document.querySelector('#btn-send-msg');
let messageList = document.querySelector('#message-list');
let messageInput = document.querySelector('#msg');

btnSendMsg.addEventListener('click', sendMsgOnClick);

function sendMsgOnClick() {
    let message = messageInput.value;

    let li = document.createElement('li');
    li.appendChild(document.createTextNode('Me: ' + message));
    messageList.appendChild(li);

    let datachannels = getDataChannels();

    message = username + ': ' + message;

    for (index in datachannels) {
        datachannels[index].send(message);
    }

    messageInput.value = '';
}

function sendSignal(action, message) {
    let jsonStr = JSON.stringify({
        'peer': username,
        // if action is new-peer they're going to immediately understand that it is a new peer and then
        // they have to send an offer to this peer. likewise they're sending offer they're going to set
        // action new-offer > send new-answer
        'action': action,
        'message': message,
    })

    webSocket.send(jsonStr);
}

function createOfferer(peerUsername, receiver_channel_name) {
    let peer = new RTCPeerConnection(null);

    addLocalTracks(peer);

    // 웹소켓은 시그널링 용으로 이용하고 채팅은 데이터 채널로 구현
    let dc = peer.createDataChannel('channel');
    dc.addEventListener('open', () => {
        console.log('Connection opened!');
    });
    dc.addEventListener('message', dcOnMessage);

    let remoteVideo = createVideo(peerUsername);
    console.log(remoteVideo);
    setOnTrack(peer, remoteVideo);

    mapPeers[peerUsername] = [peer, dc];

    peer.addEventListener('iceconnectionstatechange', () => {
        let iceConnectionState = peer.iceConnectionState;

        if (iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed') {
            delete mapPeers[peerUsername];

            if (iceConnectionState !== 'closed') {
                peer.close();
            }
            console.log('peer disconnected!');
            console.log(remoteVideo);
            removeVideo(remoteVideo);
        }

        // ice candidate gathering이 끝나면 remote peer에 sdp를 주고 받는다.
    });

    peer.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
            // console.log('New ice candidate: ', JSON.stringify(peer.localDescription));

            return;
        }
        
        // new-pper signal을 보낸 peer에게만 sdp를 보내기 위해 받은 channel_name을 같이 보냄.
        sendSignal('new-offer', {
            'sdp': peer.localDescription,
            'receiver_channel_name': receiver_channel_name
        })
    })

    peer.createOffer()
        .then(o => peer.setLocalDescription(o))
        .then(() => {
            console.log('Local description set successfully.')
        })
    
}

function createAnswerer(offer, peerUsername, receiver_channel_name) {
    let peer = new RTCPeerConnection(null);

    addLocalTracks(peer);

    // answer일때 데이터 채널을 생성하지 않음

    let remoteVideo = createVideo(peerUsername);
    setOnTrack(peer, remoteVideo);

    // e object에서 데이터 채널을 가져올 수 있음.
    peer.addEventListener('datachannel', e => {
        // offerer에서 생성한 데이터 채널을 가져옴.
        peer.dc = e.channel
        peer.dc.addEventListener('open', () => {
            console.log('Connection opened!');
        });
        peer.dc.addEventListener('message', dcOnMessage);

        mapPeers[peerUsername] = [peer, peer.dc];
    });

    peer.addEventListener('iceconnectionstatechange', () => {
        let iceConnectionState = peer.iceConnectionState;

        if (iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed') {
            delete mapPeers[peerUsername];

            if (iceConnectionState !== 'closed') {
                peer.close();
            }

            removeVideo(remoteVideo);
        }

        // ice candidate gathering이 끝나면 remote peer에 sdp를 주고 받는다.
    });

    peer.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
            console.log('New ice candidate: ', JSON.stringify(peer.localDescription));

            return;
        }
        
        // new-pper signal을 보낸 peer에게만 sdp를 보내기 위해 받은 channel_name을 같이 보냄.
        sendSignal('new-answer', {
            'sdp': peer.localDescription,
            'receiver_channel_name': receiver_channel_name
        })
    })

    peer.setRemoteDescription(offer)
        .then(() => {
            console.log('Remote description set successfully for %s.', peerUsername);

            return peer.createAnswer();
        })
        .then(a => {
            console.log('Answer created!');

            peer.setLocalDescription(a);
        })
    
}

// addTrack api 문서 확인
function addLocalTracks(peer) {
    localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);

        return;
    })
}

function dcOnMessage(event) {
    console.log('dc event: ', event);
    let message = event.data;

    let li = document.createElement('li');
    li.appendChild(document.createTextNode(message));
    messageList.appendChild(li);
}

function createVideo(peerUsername) {
    let videoContainer = document.querySelector('#video-container');

    let remoteVideo = document.createElement('video');

    remoteVideo.id = peerUsername + '-video';
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;

    let videoWrapper = document.createElement('div');

    videoContainer.appendChild(videoWrapper);

    videoWrapper.appendChild(remoteVideo);

    return remoteVideo;
}

function setOnTrack(peer, remoteVideo) {
    let remoteStream = new MediaStream();

    remoteVideo.srcObject = remoteStream;

    // 외부 미디어(비디오, 오디오 등)이 연결되면 발생함.
    peer.addEventListener('track', async (event) => {
        remoteStream.addTrack(event.track, remoteStream);
    })
}

function removeVideo(video) {
    let videoWrapper = video.parentNode;
    console.log(videoWrapper);

    videoWrapper.parentNode.removeChild(videoWrapper);
}

function getDataChannels() {
    let datachannels = [];

    for (peerUsername in mapPeers) {
        let datachannel = mapPeers[peerUsername][1];

        datachannels.push(datachannel);
    }

    return datachannels;
}