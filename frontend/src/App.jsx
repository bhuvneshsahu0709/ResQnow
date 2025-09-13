import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [recording, setRecording] = useState(false);
  const [location, setLocation] = useState({ lat: '', lng: '' });
  const [contacts, setContacts] = useState([]);
  const [newContact, setNewContact] = useState({ name: '', phone: '' });
  const [showTwilioHelp, setShowTwilioHelp] = useState(false);
  const [sosStatus, setSosStatus] = useState('ready'); // 'ready', 'first-sent', 'waiting', 'completed'
  const [countdown, setCountdown] = useState(0);
  const [sosAttempt, setSosAttempt] = useState(1); // Track current attempt (1-4)
  const [notification, setNotification] = useState({ message: '', type: '' }); // Footer notification
  const [deferredPrompt, setDeferredPrompt] = useState(null); // PWA install prompt
  const [showInstallPrompt, setShowInstallPrompt] = useState(false); // Show install button
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const countdownIntervalRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const originalRecordingUrlRef = useRef(null);

  useEffect(() => { 
    fetchContacts(); 
    
    // PWA Install Prompt handling
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    const handleAppInstalled = () => {
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
      showNotification('SOS App installed successfully!', 'success');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    
    // Cleanup intervals and timeouts on unmount
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const getLocation = () => {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(loc);
          resolve(loc);
        });
      } else reject('Geolocation not supported');
    });
  };

  // Get API base URL from environment or use localhost for development
  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://your-backend-url.railway.app' : 'http://localhost:5000');

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    // Auto-hide notification after 5 seconds
    setTimeout(() => {
      setNotification({ message: '', type: '' });
    }, 5000);
  };

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    }
  };

  const fetchContacts = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/contacts`);
      setContacts(res.data.contacts);
    } catch (err) { console.error(err); }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE_URL}/api/add-contact`, newContact);
      setNewContact({ name: '', phone: '' });
      fetchContacts();
      showNotification('Contact added successfully!', 'success');
    } catch (err) { 
      console.error(err); 
      showNotification('Failed to add contact', 'error');
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (window.confirm('Are you sure you want to delete this contact?')) {
      try {
        await axios.delete(`${API_BASE_URL}/api/contacts/${contactId}`);
        fetchContacts();
        showNotification('Contact deleted successfully!', 'success');
      } catch (err) {
        console.error(err);
        showNotification('Failed to delete contact', 'error');
      }
    }
  };

  const handleClearAllContacts = async () => {
    if (window.confirm('Are you sure you want to delete ALL contacts? This cannot be undone.')) {
      try {
        // Delete all contacts one by one
        await Promise.all(contacts.map(contact => 
          axios.delete(`${API_BASE_URL}/api/contacts/${contact._id}`)
        ));
        fetchContacts();
        showNotification('All contacts deleted successfully!', 'success');
      } catch (err) {
        console.error(err);
        showNotification('Failed to delete contacts', 'error');
      }
    }
  };

  const handleSOS = async () => {
    if (sosStatus === 'ready') {
      // First SOS message
      setRecording(true);
      setSosStatus('first-sent');
      setSosAttempt(1);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = e => { audioChunksRef.current.push(e.data); };
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendSOS(audioBlob, 'immediate');
        setRecording(false);
        startCountdown();
      };
      mediaRecorderRef.current.start();
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 25000);
    }
  };

  const startCountdown = () => {
    setCountdown(300); // 5 minutes = 300 seconds
    setSosStatus('waiting');
    
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          // Automatically send next SOS after 5 minutes
          sendAutomaticNextSOS();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleStopSOS = () => {
    // Stop any active recording immediately
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
    
    // Clear the recording timeout
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    
    // Clear the countdown interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    
    // Reset all states
    setCountdown(0);
    setSosStatus('ready');
    setSosAttempt(1);
    
    // Clear any stored recording URL
    originalRecordingUrlRef.current = null;
    
    // Show appropriate message based on current status
    if (sosStatus === 'ready') {
      showNotification('You are safe! No emergency active.', 'success');
    } else {
      showNotification('Emergency stopped immediately. You are safe!', 'success');
    }
  };

  const sendAutomaticNextSOS = async () => {
    try {
      const nextAttempt = sosAttempt + 1;
      setSosAttempt(nextAttempt);
      
      // Record new audio for next message
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];
      
      mediaRecorder.ondataavailable = e => { audioChunks.push(e.data); };
      
      return new Promise((resolve, reject) => {
        mediaRecorder.onstop = async () => {
          try {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const loc = await getLocation();
            
            // Send next SOS with new audio
            const formData = new FormData();
            formData.append('audio', audioBlob);
            formData.append('lat', loc.lat);
            formData.append('lng', loc.lng);
            formData.append('originalRecordingUrl', originalRecordingUrlRef.current);
            
            const res = await axios.post(`${API_BASE_URL}/api/sos-delayed`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            console.log(`Automatic SOS attempt ${nextAttempt} sent with new audio:`, res.data.message);
            if (res.data && res.data.results) {
              console.log('Automatic Twilio Results:', res.data.results);
            }
            
            // Show notification
            showNotification(`SOS #${nextAttempt} sent successfully!`, 'success');
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
            
            // Check if we've reached the maximum attempts (4)
            if (nextAttempt >= 4) {
              setSosStatus('completed');
              showNotification('All 4 SOS messages sent! Emergency responders notified.', 'success');
              console.log('All 4 SOS attempts completed');
            } else {
              // Start countdown for next attempt
              startCountdown();
            }
            
            resolve();
          } catch (err) {
            console.error(`Failed to send automatic SOS attempt ${nextAttempt}:`, err);
            setSosStatus('ready'); // Reset if failed
            stream.getTracks().forEach(track => track.stop());
            reject(err);
          }
        };
        
        // Start recording for 10 seconds (shorter for automatic)
        mediaRecorder.start();
        setTimeout(() => {
          mediaRecorder.stop();
        }, 10000); // 10 seconds for automatic recording
      });
      
    } catch (err) { 
      console.error(`Failed to start automatic SOS attempt ${sosAttempt + 1} recording:`, err); 
      setSosStatus('ready'); // Reset if failed
    }
  };

  const sendSOS = async (audioBlob, messageType = 'immediate') => {
    try {
      const loc = await getLocation();
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('lat', loc.lat);
      formData.append('lng', loc.lng);
      formData.append('messageType', messageType);
      const res = await axios.post(`${API_BASE_URL}/api/sos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showNotification(`SOS #${sosAttempt} sent successfully!`, 'success');
      if (res.data && res.data.results) {
        console.log('Twilio Results:', res.data.results);
      }
      if (res.data.recordingUrl) {
        console.log('Recording URL:', res.data.recordingUrl);
        originalRecordingUrlRef.current = res.data.recordingUrl;
      }
    } catch (err) { 
      console.error(err); 
      showNotification('Failed to send SOS', 'error');
    }
  };


  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      backgroundAttachment: 'fixed',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated background elements */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
          radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 40% 40%, rgba(255, 255, 255, 0.05) 0%, transparent 50%)
        `,
        animation: 'float 6s ease-in-out infinite'
      }}></div>
      
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '10%',
        width: '100px',
        height: '100px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '50%',
        animation: 'pulse 2s infinite'
      }}></div>
      
      <div style={{
        position: 'absolute',
        top: '60%',
        right: '15%',
        width: '60px',
        height: '60px',
        background: 'rgba(255, 255, 255, 0.08)',
        borderRadius: '50%',
        animation: 'pulse 3s infinite'
      }}></div>

      <div style={{ 
        textAlign: 'center', 
        padding: '30px 20px',
        position: 'relative',
        zIndex: 1
      }}>
        <h1 style={{
          color: 'white',
          fontSize: '2.5rem',
          fontWeight: 'bold',
          textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
          marginBottom: '10px',
          background: 'linear-gradient(45deg, #fff, #f0f0f0)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          🚨 Emergency SOS App 🚨
        </h1>
        
        <p style={{
          color: 'rgba(255, 255, 255, 0.9)',
          fontSize: '1.1rem',
          marginBottom: '30px',
          textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
        }}>
          Quick emergency alerts with location & audio
        </p>

      <div style={{ margin: '20px 0', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setShowTwilioHelp(!showTwilioHelp)}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '25px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
            textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
          }}
          onMouseOver={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.3)';
            e.target.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.2)';
            e.target.style.transform = 'translateY(0)';
          }}
        >
          {showTwilioHelp ? 'Hide' : 'Show'} Twilio Setup Help
        </button>

        {/* PWA Install Button */}
        {showInstallPrompt && (
          <button 
            onClick={handleInstallApp}
            style={{
              background: 'linear-gradient(45deg, #28a745, #20c997)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.3s ease',
              textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
              boxShadow: '0 4px 15px rgba(40, 167, 69, 0.3)'
            }}
            onMouseOver={(e) => {
              e.target.style.background = 'linear-gradient(45deg, #20c997, #28a745)';
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 6px 20px rgba(40, 167, 69, 0.4)';
            }}
            onMouseOut={(e) => {
              e.target.style.background = 'linear-gradient(45deg, #28a745, #20c997)';
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 15px rgba(40, 167, 69, 0.3)';
            }}
          >
            📱 Install App
          </button>
        )}
        {showTwilioHelp && (
          <div style={{ 
            textAlign: 'left', 
            maxWidth: 800, 
            margin: '20px auto', 
            padding: '20px', 
            background: 'rgba(255, 255, 255, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.2)', 
            borderRadius: '15px',
            backdropFilter: 'blur(10px)',
            color: 'white',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: 'white', textShadow: '1px 1px 2px rgba(0,0,0,0.3)' }}>📞 How Twilio Places a Call (Step by Step)</h3>
            <ol style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
              <li>Twilio provides you a phone number (your caller ID, the From).</li>
              <li>Verify your own number in Twilio Console → Phone Numbers → Verified Caller IDs.</li>
              <li>Your app triggers a call using your Twilio SID, Auth Token, and From number.</li>
              <li>Your phone rings from the Twilio number; on answer, Twilio plays a message.</li>
            </ol>
            <p><b>Env required:</b></p>
            <pre style={{ 
              whiteSpace: 'pre-wrap',
              background: 'rgba(0,0,0,0.2)',
              padding: '10px',
              borderRadius: '5px',
              color: '#fff'
            }}>TWILIO_PHONE=+1xxxxxxxxxx</pre>
            <p><b>India note:</b> SMS often fails with trial numbers; calls typically work from US numbers. Ensure the recipient is verified on trial accounts.</p>
          </div>
        )}
      </div>

      {/* Contact Form */}
      <div style={{ 
        marginBottom: '40px',
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '25px',
        borderRadius: '20px',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        maxWidth: '600px',
        margin: '0 auto 40px auto'
      }}>
        <h2 style={{ 
          color: 'white', 
          textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
          marginBottom: '20px'
        }}>📱 Add Emergency Contact</h2>
        <form onSubmit={handleAddContact} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <input 
            type="text" 
            placeholder="Contact Name" 
            value={newContact.name}
            onChange={e => setNewContact({ ...newContact, name: e.target.value })} 
            required 
            style={{ 
              padding: '12px 15px', 
              borderRadius: '25px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              fontSize: '14px',
              backdropFilter: 'blur(10px)',
              outline: 'none',
              minWidth: '150px'
            }}
            onFocus={(e) => e.target.style.border = '2px solid rgba(255, 255, 255, 0.6)'}
            onBlur={(e) => e.target.style.border = '2px solid rgba(255, 255, 255, 0.3)'}
          />
          <input 
            type="tel" 
            placeholder="Phone Number" 
            value={newContact.phone}
            onChange={e => setNewContact({ ...newContact, phone: e.target.value })} 
            required 
            style={{ 
              padding: '12px 15px', 
              borderRadius: '25px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              fontSize: '14px',
              backdropFilter: 'blur(10px)',
              outline: 'none',
              minWidth: '150px'
            }}
            onFocus={(e) => e.target.style.border = '2px solid rgba(255, 255, 255, 0.6)'}
            onBlur={(e) => e.target.style.border = '2px solid rgba(255, 255, 255, 0.3)'}
          />
          <button 
            type="submit"
            style={{
              padding: '12px 25px',
              borderRadius: '25px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.3s ease',
              textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
            }}
            onMouseOver={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.3)';
              e.target.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.2)';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            ➕ Add
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '25px', marginBottom: '15px' }}>
          <h3 style={{ 
            color: 'white', 
            textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
            margin: 0
          }}>📋 Saved Contacts</h3>
          
          {contacts.length > 0 && (
            <button
              onClick={handleClearAllContacts}
              style={{
                background: 'linear-gradient(45deg, #ff4757, #ff3742)',
                border: 'none',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '15px',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(255, 71, 87, 0.3)',
                fontWeight: 'bold'
              }}
              onMouseOver={(e) => {
                e.target.style.background = 'linear-gradient(45deg, #ff3742, #ff4757)';
                e.target.style.transform = 'scale(1.05)';
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'linear-gradient(45deg, #ff4757, #ff3742)';
                e.target.style.transform = 'scale(1)';
              }}
            >
              🗑️ Clear All
            </button>
          )}
        </div>
        <div style={{ 
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '10px',
          padding: '15px',
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          {contacts.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {contacts.map(c => (
                <li key={c._id || c.phone} style={{
                  color: 'rgba(255, 255, 255, 0.9)',
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  fontSize: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>👤 {c.name} - 📞 {c.phone}</span>
                  <button
                    onClick={() => handleDeleteContact(c._id)}
                    style={{
                      background: 'linear-gradient(45deg, #ff4757, #ff3742)',
                      border: 'none',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 8px rgba(255, 71, 87, 0.3)'
                    }}
                    onMouseOver={(e) => {
                      e.target.style.background = 'linear-gradient(45deg, #ff3742, #ff4757)';
                      e.target.style.transform = 'scale(1.05)';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.background = 'linear-gradient(45deg, #ff4757, #ff3742)';
                      e.target.style.transform = 'scale(1)';
                    }}
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', margin: 0 }}>
              No contacts added yet
            </p>
          )}
        </div>
      </div>

      {/* SOS Button */}
      <div style={{ marginTop: '40px' }}>
        <button 
          onClick={handleSOS} 
          disabled={recording || sosStatus === 'waiting' || sosStatus === 'completed'}
          style={{ 
            padding: '25px 50px', 
            fontSize: '24px', 
            fontWeight: 'bold',
            background: sosStatus === 'completed' ? 
              'linear-gradient(45deg, #28a745, #20c997)' :
              recording ? 
                'linear-gradient(45deg, #ff6b6b, #ee5a52)' : 
                sosStatus === 'waiting' ?
                  'linear-gradient(45deg, #ffc107, #ffb300)' :
                  'linear-gradient(45deg, #ff4757, #ff3742)',
            color: 'white',
            border: 'none',
            borderRadius: '50px',
            cursor: (recording || sosStatus === 'waiting' || sosStatus === 'completed') ? 'not-allowed' : 'pointer',
            boxShadow: recording ? 
              '0 8px 25px rgba(255, 71, 87, 0.3)' : 
              '0 8px 25px rgba(255, 71, 87, 0.5)',
            textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
            transition: 'all 0.3s ease',
            transform: recording ? 'scale(0.95)' : 'scale(1)',
            animation: recording ? 'pulse 1s infinite' : 'none',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseOver={(e) => {
            if (!recording && sosStatus === 'ready') {
              e.target.style.transform = 'scale(1.05)';
              e.target.style.boxShadow = '0 12px 35px rgba(255, 71, 87, 0.6)';
            }
          }}
          onMouseOut={(e) => {
            if (!recording && sosStatus === 'ready') {
              e.target.style.transform = 'scale(1)';
              e.target.style.boxShadow = '0 8px 25px rgba(255, 71, 87, 0.5)';
            }
          }}
        >
          {recording ? '🔴 Recording...' : 
           sosStatus === 'completed' ? '✅ All 4 SOS Messages Sent!' :
           sosStatus === 'waiting' ? `⏰ Auto-sending SOS #${sosAttempt + 1} in ${Math.floor(countdown/60)}:${(countdown%60).toString().padStart(2, '0')}` :
           '🚨 EMERGENCY SOS 🚨'}
        </button>

        {/* All Safe Button - Always available */}
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button 
            onClick={handleStopSOS}
            style={{
              padding: '20px 40px',
              fontSize: '20px',
              fontWeight: 'bold',
              background: sosStatus === 'ready' ? 
                'linear-gradient(45deg, #28a745, #20c997)' :
                'linear-gradient(45deg, #ffc107, #ffb300)',
              color: 'white',
              border: '3px solid white',
              borderRadius: '30px',
              cursor: 'pointer',
              boxShadow: '0 8px 25px rgba(0,0,0,0.3)',
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden',
              minWidth: '300px'
            }}
            onMouseOver={(e) => {
              e.target.style.transform = 'scale(1.1)';
              e.target.style.boxShadow = '0 12px 35px rgba(0,0,0,0.4)';
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'scale(1)';
              e.target.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
            }}
          >
            {sosStatus === 'ready' ? '✅ ALL SAFE - NO EMERGENCY' : '✅ ALL SAFE - STOP EMERGENCY'}
          </button>
        </div>
        
        <p style={{
          color: 'rgba(255, 255, 255, 0.9)',
          fontSize: '16px',
          marginTop: '20px',
          textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
          background: 'rgba(0, 0, 0, 0.2)',
          padding: '10px 20px',
          borderRadius: '20px',
          display: 'inline-block'
        }}>
          📍 Location: {location.lat && `${location.lat}, ${location.lng}` || 'Not detected yet'}
        </p>

        {/* Status Indicator */}
        {sosStatus !== 'ready' && (
          <div style={{
            marginTop: '20px',
            padding: '15px 25px',
            background: sosStatus === 'completed' ? 
              'rgba(40, 167, 69, 0.2)' : 
              sosStatus === 'waiting' ? 
                'rgba(255, 193, 7, 0.2)' : 
                'rgba(255, 71, 87, 0.2)',
            border: sosStatus === 'completed' ? 
              '2px solid rgba(40, 167, 69, 0.5)' : 
              sosStatus === 'waiting' ? 
                '2px solid rgba(255, 193, 7, 0.5)' : 
                '2px solid rgba(255, 71, 87, 0.5)',
            borderRadius: '15px',
            color: 'white',
            fontSize: '16px',
            fontWeight: 'bold',
            textAlign: 'center',
            backdropFilter: 'blur(10px)'
          }}>
            {sosStatus === 'first-sent' && `✅ SOS #${sosAttempt} sent! Recording audio... Click "All Safe" below if you're okay.`}
            {sosStatus === 'waiting' && `⏰ Auto-sending SOS #${sosAttempt + 1} in ${Math.floor(countdown/60)}:${(countdown%60).toString().padStart(2, '0')} - Will record new audio automatically! (${4 - sosAttempt} attempts remaining) Click "All Safe" below if you're okay.`}
            {sosStatus === 'completed' && '✅ All 4 SOS messages sent automatically! Emergency responders have been notified 4 times with separate audio recordings.'}
          </div>
        )}
      </div>

      {/* Footer Notification */}
      {notification.message && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: notification.type === 'error' ? 
            'linear-gradient(45deg, #ff4757, #ff3742)' : 
            'linear-gradient(45deg, #28a745, #20c997)',
          color: 'white',
          padding: '12px 25px',
          borderRadius: '25px',
          fontSize: '14px',
          fontWeight: 'bold',
          textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
          zIndex: 1000,
          animation: 'slideUp 0.3s ease-out',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          {notification.type === 'error' ? '❌' : '✅'} {notification.message}
        </div>
      )}
    </div>

    {/* Add CSS animations */}
    <style>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes slideUp {
          0% { 
            transform: translateX(-50%) translateY(100px);
            opacity: 0;
          }
          100% { 
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }
        input::placeholder {
          color: rgba(255, 255, 255, 0.6);
        }
      `}</style>
    </div>
  );
}

export default App;


