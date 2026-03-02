// 1. Initialize variables first
let currentUser = null;
let currentChannel = 'General';
let isMod = false;
let isLoginMode = true;
let activeReply = null;

const channels = ['General', 'Random', 'Media', 'Homework Help', 'Dev-logs'];
const lockedChannels = ['Dev-logs'];
const imageAllowedChannels = ['Media', 'Homework Help'];

// 2. Initialize PubNub immediately so it's available for functions below
const pubnub = new PubNub({
  publishKey: 'pub-c-c0aced8f-55d8-481d-82da-a47722855981',
  subscribeKey: 'sub-c-b05e28e8-72b5-45cf-bfdb-4448d0de7336',
  userId: 'temp-user-' + Math.floor(Math.random() * 1000)
});

// 3. Helper for the on-screen status box
function logStatus(msg) {
  const log = document.getElementById('status-log');
  if (log) log.innerText = "Status: " + msg;
  console.log("Status Update:", msg);
}

// 4. Authentication Logic
function handleAuth() {
  const user = document.getElementById('login-username').value.trim().toLowerCase();
  const pass = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  
  if (!user || !pass) {
    err.innerText = "Please fill in all fields.";
    err.style.display = "block";
    return;
  }

  logStatus("Contacting database...");

  if (isLoginMode) {
    // LOGIN MODE
    pubnub.objects.getUUIDMetadata({ uuid: user })
      .then((res) => {
        if (res.data && res.data.custom && res.data.custom.pw === pass) {
          logStatus("Login Success!");
          loginSuccess(user);
        } else {
          logStatus("Wrong password.");
          err.innerText = "Invalid password.";
          err.style.display = "block";
        }
      })
      .catch((e) => {
        logStatus("User not found.");
        err.innerText = "User does not exist.";
        err.style.display = "block";
      });
  } else {
    // SIGN UP MODE
    pubnub.objects.getUUIDMetadata({ uuid: user })
      .then(() => {
        logStatus("Username taken.");
        err.innerText = "Username already exists.";
        err.style.display = "block";
      })
      .catch(() => {
        // User not found, proceed to create
        pubnub.objects.setUUIDMetadata({
          uuid: user,
          data: { name: user, custom: { pw: pass } }
        })
        .then(() => {
          logStatus("Account created!");
          loginSuccess(user);
        })
        .catch((regErr) => {
          logStatus("Error: App Context not enabled in PubNub Dashboard.");
        });
      });
  }
}

function loginSuccess(username) {
  currentUser = username;
  localStorage.setItem('loggedInUser', username);
  
  // Update PubNub with the real username
  pubnub.setUUID(username);
  
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';
  document.getElementById('display-username').innerText = currentUser;
  
  pubnub.subscribe({ channels: [currentChannel] });
  renderChannels();
  loadHistory();
}

// 5. App Startup
window.addEventListener('load', () => {
  const savedUser = localStorage.getItem('loggedInUser');
  if (savedUser) {
    logStatus("Auto-logging in " + savedUser);
    loginSuccess(savedUser);
  } else {
    logStatus("Ready to Sign In.");
  }
});

// --- REST OF CHAT LOGIC ---

function sendMessage() {
  const input = document.getElementById('messageInput');
  if (!input.value.trim()) return;

  pubnub.publish({
    channel: currentChannel,
    message: {
      id: 'm-' + Date.now(),
      sender: currentUser,
      text: input.value,
      replyTo: activeReply
    }
  });
  input.value = '';
  cancelReply();
}

function displayMessage(msg) {
  if (document.getElementById(msg.id)) return;
  const chat = document.getElementById('chat');
  const div = document.createElement('div');
  div.id = msg.id;
  div.className = 'message';

  let replyLine = msg.replyTo ? `<div style="font-size:10px; opacity:0.6; margin-left:10px;">↳ Replying to ${msg.replyTo.sender}</div>` : "";

  div.innerHTML = `${replyLine}<span class="author">${escapeHTML(msg.sender)}:</span><span>${getMsgHTML(msg.text)}</span>
    <span class="mod-btn" onclick="setReply('${msg.id}', '${msg.sender}')">Reply</span>`;
  
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function loadHistory() {
  pubnub.fetchMessages({ channels: [currentChannel], count: 50 }, (status, response) => {
    if (response && response.channels[currentChannel]) {
      response.channels[currentChannel].forEach(m => displayMessage(m.message));
    }
  });
}

function renderChannels() {
  document.getElementById('channel-list').innerHTML = channels.map(c => `
    <div onclick="switchChannel('${c}')" style="padding:10px; cursor:pointer; color:${c===currentChannel?'white':'#949ba4'}; background:${c===currentChannel?'#3f4147':'transparent'}; border-radius:4px; margin: 2px 8px;">
      # ${c}
    </div>
  `).join('');
}

function switchChannel(name) {
  if (currentChannel === name) return;
  pubnub.unsubscribe({ channels: [currentChannel] });
  currentChannel = name;
  document.getElementById('chat').innerHTML = '';
  pubnub.subscribe({ channels: [currentChannel] });
  renderChannels();
  loadHistory();
}

function toggleAuthMode() {
  isLoginMode = !isLoginMode;
  document.getElementById('login-title').innerText = isLoginMode ? "Join the Chat" : "Create Account";
  document.getElementById('login-btn').innerText = isLoginMode ? "Sign In" : "Sign Up";
  document.getElementById('toggle-auth-text').innerText = isLoginMode ? "Don't have an account?" : "Already have an account?";
  document.getElementById('login-error').style.display = "none";
}

function logout() {
  localStorage.removeItem('loggedInUser');
  window.location.reload();
}

function escapeHTML(str) {
  const p = document.createElement('p');
  p.textContent = str;
  return p.innerHTML;
}

function getMsgHTML(text) {
  let safe = escapeHTML(text);
  const imgRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/i;
  if (imgRegex.test(safe) && imageAllowedChannels.includes(currentChannel)) {
    return safe.replace(imgRegex, url => `<img src="${url}" class="chat-image">`);
  }
  return safe;
}

function setReply(id, sender) {
  activeReply = { id, sender };
  document.getElementById('reply-preview').style.display = 'flex';
  document.getElementById('reply-preview-text').innerText = "Replying to " + sender;
}

function cancelReply() {
  activeReply = null;
  document.getElementById('reply-preview').style.display = 'none';
}

function toggleMod() {
  const pw = prompt("Mod Password:");
  if (pw === "G!oo2fy#mod") {
    isMod = true;
    document.getElementById('right-sidebar').style.display = 'block';
    alert("Moderator mode active.");
  } else {
    alert("Incorrect.");
  }
}

pubnub.addListener({
  message: (e) => { if (e.channel === currentChannel) displayMessage(e.message); }
});
