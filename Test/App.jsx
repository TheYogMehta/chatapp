import React, { useState } from 'react';

const SecurityApp = () => {
  const [view, setView] = useState('chat'); // 'chat', 'addFriends', 'settings'
  const [activeSetting, setActiveSetting] = useState('profile');
  const [messages, setMessages] = useState([
    { id: 1, text: "Welcome to SecureChat!", sender: "system" }
  ]);
  const [input, setInput] = useState('');

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages([...messages, { id: Date.now(), text: input, sender: 'me' }]);
    setInput('');
  };

  const settingsData = {
    profile: {
      title: "Profile Settings",
      content: ["Change Avatar", "Update Username", "Encryption Key Management"]
    },
    decoy: {
      title: "Decoy Mode",
      content: ["Enable Duress Password", "Fake Chat History", "Auto-wipe on failure"]
    },
    proxy: {
      title: "Proxy Settings",
      content: ["SOCKS5 Configuration", "Tor Routing", "HTTP Proxy"]
    },
    customServer: {
      title: "Custom Server",
      content: ["Server URL: https://", "Port: 443", "TLS Certificate Pinning"]
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#1a1a1a', color: 'white', fontFamily: 'sans-serif' }}>
      
      {/* EXTREME LEFT */}
      <div style={{ width: '60px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
        <button onClick={() => setView('chat')} style={btnStyle}>💬</button>
        <button onClick={() => setView('settings')} style={btnStyle}>⚙️</button>
      </div>

      {/* MIDDLE & RIGHT */}
      <div style={{ flex: 1, display: 'flex' }}>

        {view === 'chat' && (
          <>
            {/* LEFT: CHAT LIST */}
            <div style={{ width: '300px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, padding: '10px' }}>
                <h3>Recent Chats</h3>
                <div style={chatThumbStyle}>Secure Contact A</div>
                <div style={chatThumbStyle}>Project Group</div>
              </div>
              <button onClick={() => setView('addFriends')} style={addFriendBtnStyle}>
                + Add Friends
              </button>
            </div>

            {/* RIGHT: CHAT INBOX */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                {messages.map(m => (
                  <div
                    key={m.id}
                    style={{ textAlign: m.sender === 'me' ? 'right' : 'left', margin: '10px 0' }}
                  >
                    <span style={{ background: m.sender === 'me' ? '#007bff' : '#333', padding: '8px 12px', borderRadius: '10px' }}>
                      {m.text}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ padding: '20px', borderTop: '1px solid #333', display: 'flex' }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  style={inputStyle}
                  placeholder="Type an encrypted message..."
                />
                <button onClick={sendMessage} style={sendBtnStyle}>Send</button>
              </div>
            </div>
          </>
        )}

        {view === 'addFriends' && (
          <div style={{ flex: 1, padding: '40px', textAlign: 'center' }}>
            <h2>Add Friends</h2>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '30px' }}>
              <div style={cardStyle}>
                <h4>Invite via Code</h4>
                <input placeholder="Enter friend's code" style={inputStyle} />
                <button style={sendBtnStyle}>Add</button>
              </div>
              <div style={cardStyle}>
                <h4>Your Invite Code</h4>
                <code style={{ display: 'block', margin: '15px 0', fontSize: '1.2rem' }}>
                  SECURE-99X-Z1
                </code>
                <button style={sendBtnStyle}>Copy Code</button>
              </div>
            </div>
            <button
              onClick={() => setView('chat')}
              style={{ marginTop: '20px', background: 'none', color: 'gray', border: 'none', cursor: 'pointer' }}
            >
              Back to Chat
            </button>
          </div>
        )}

        {view === 'settings' && (
          <div style={{ flex: 1, display: 'flex' }}>
            <div style={{ width: '250px', borderRight: '1px solid #333', padding: '20px' }}>
              <h3>Settings</h3>
              {Object.keys(settingsData).map(key => (
                <div
                  key={key}
                  onClick={() => setActiveSetting(key)}
                  style={{ ...chatThumbStyle, backgroundColor: activeSetting === key ? '#333' : 'transparent' }}
                >
                  {settingsData[key].title}
                </div>
              ))}
            </div>

            <div style={{ flex: 1, padding: '40px' }}>
              <h2>{settingsData[activeSetting].title}</h2>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {settingsData[activeSetting].content.map((item, i) => (
                  <li key={i} style={settingItemStyle}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

// STYLES
const btnStyle = { fontSize: '24px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', marginBottom: '20px' };
const chatThumbStyle = { padding: '15px', borderBottom: '1px solid #222', cursor: 'pointer', borderRadius: '5px' };
const addFriendBtnStyle = { padding: '15px', backgroundColor: '#28a745', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' };
const inputStyle = { flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #444', backgroundColor: '#222', color: 'white' };
const sendBtnStyle = { marginLeft: '10px', padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' };
const cardStyle = { padding: '20px', border: '1px solid #444', borderRadius: '10px', width: '250px' };
const settingItemStyle = { padding: '15px 0', borderBottom: '1px solid #333', color: '#ccc' };

export default SecurityApp;
